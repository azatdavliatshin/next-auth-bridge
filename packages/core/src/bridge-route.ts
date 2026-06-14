// next-auth-bridge — the /auth/bridge handler builder (ROUTE-01/02/04).
//
// This is the security-critical heart of the phase: it mints an opaque,
// one-time-use handle ONLY after the app-injected verifier confirms a real
// session, harvests ONLY the Auth.js session-token chunks from the incoming
// request, and returns `200 { code }` with ZERO cookies set. Each invariant
// below ships with a negative test in __tests__/bridge-route.test.ts.
//
// THREAT-04 (Spoofing / Elevation — the session gate): `verifySession` runs
// FIRST and independently. A falsy result → 401 with no body detail. No
// wrapper/context signal (e.g. `?popup=true`) ever gates the mint — context is
// UX routing, never a security boundary (CLAUDE.md invariant 4).
//
// THREAT-05 (Tampering — PKCE non-interference): the harvest matches ONLY the
// resolved session-token base + numeric chunk suffixes (via harvestSessionChunks
// — D-05). csrf / pkce / state / callback-url decoys are excluded by
// construction, and the success response sets ZERO cookies (AM-2) so the bridge
// can never clobber an Auth.js-managed PKCE/state cookie (ROUTE-04).
//
// THREAT-09 / ROUTE-02 (no token in body, no handle in URL): the response body
// is `{ code }` — an opaque 64-hex handle only. No session token, no
// JWT-shaped string, and the handle never touches a URL.
//
// T-02-15 (D-15 — empty-harvest fails loud): a verified session whose request
// carries no matching session-token chunk → 5xx, store.create NOT called. This
// is a cookie-name mismatch (D-16), not a benign success; minting here would
// hand consume a handle that re-sets zero cookies.
//
// T-02-12 (D-12/D-14 — Origin allowlist, defense-in-depth): a PRESENT but
// disallowed Origin → 4xx; an ABSENT Origin passes through to the real gate
// (a same-origin GET legitimately carries no Origin — D-14). This is a
// complementary control, NOT the boundary (the boundary is verifySession).
//
// D-06: the returned handler is a plain Web-standard `(request) => Promise<Response>`
// closure — no Next.js runtime coupling, driven directly on the Vitest bench.

import type { AuthBridgeOptions } from "./types.js";
import { getAuthCookieName } from "./auth-helpers.js";
import { harvestSessionChunks, parseCookieHeader } from "./cookie-codec.js";

/**
 * Build the `/auth/bridge` request handler from one config (D-06 / D-10).
 *
 * The returned closure runs the security gate in this exact, commented order:
 *   1. Origin check (D-12/D-14)      — present-but-disallowed → 4xx; absent → pass
 *   2. Session gate (ROUTE-01/T-04)  — falsy verifySession → 401, no mint
 *   3. Resolve the cookie prefix     — getAuthCookieName (D-16)
 *   4. Harvest session-token chunks  — harvestSessionChunks (D-05, decoys excluded)
 *   5. Empty-harvest guard (D-15)    — zero chunks → 5xx, store.create NOT called
 *   6. Mint                          — store.create(harvested) → { code }
 *   7. Respond (ROUTE-02/AM-2)       — 200 { code }, JSON, ZERO Set-Cookie
 */
export function createBridgeHandler(
  options: AuthBridgeOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    // 1. Origin check (D-12/D-14) — defense-in-depth, NOT the security boundary.
    // A PRESENT Origin not in the allowlist is rejected (4xx); an ABSENT Origin
    // passes through to the real gate (a same-origin GET to /auth/bridge
    // legitimately carries no Origin header — D-14).
    const origin = request.headers.get("Origin");
    if (origin !== null && !options.allowedOrigins.includes(origin)) {
      return new Response(null, { status: 403 });
    }

    // 2. Session gate (ROUTE-01 / THREAT-04) — the real boundary. Runs FIRST and
    // independently; NEVER branched on a wrapper/context signal. A falsy result
    // refuses with 401 and no body detail (D-07).
    const session = await options.verifySession();
    if (!session) {
      return new Response(null, { status: 401 });
    }

    // 3. Resolve the session-cookie base name that bounds the harvest scope.
    // Threads D-16 so http/localhost can reach the non-prefixed name.
    const base = getAuthCookieName({
      cookieName: options.cookieName,
      secure: options.secure,
    });

    // 4. Harvest (D-05) — select ONLY the session-token base + numeric chunk
    // suffixes. csrf / pkce / state / callback-url decoys are excluded by
    // harvestSessionChunks (THREAT-05 / ROUTE-04).
    const cookies = parseCookieHeader(request.headers.get("Cookie"));
    const harvested = harvestSessionChunks(cookies, base);

    // 5. Empty-harvest guard (D-15 / T-02-15) — a verified session with no
    // harvestable chunk means a cookie-name mismatch (D-16), not a benign
    // success. Fail loud (5xx); do NOT mint a handle consume would empty out.
    if (harvested.length === 0) {
      return new Response(null, { status: 500 });
    }

    // 6. Mint — the store owns the entropy; the bridge supplies only the payload
    // (D-01). Reached ONLY after a verified session AND a non-empty harvest.
    const { code } = await options.store.create(harvested);

    // 7. Respond (D-07 / ROUTE-02 / AM-2) — 200 with the opaque handle in the
    // JSON body only. No session token, no handle in a URL, and ZERO Set-Cookie
    // headers (AM-2 makes PKCE non-interference observable: the bridge never
    // writes a cookie, so it cannot clobber Auth.js state).
    return new Response(JSON.stringify({ code }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}
