// next-auth-bridge — the /auth/consume handler builder (ROUTE-03).
//
// This is the other half of the security-critical handoff: it exchanges a
// one-time opaque handle for the stored session-token chunks and re-sets each
// one as a CHIPS-partitioned cookie, then 302s to a sanitizeNext-validated
// destination. Each invariant below ships with a negative test in
// __tests__/consume-route.test.ts.
//
// THREAT-06 (Tampering / Spoofing — the handle exchange): store.consume is the
// atomic, delete-first, null-on-miss gate (Phase 1 D-03/D-09). A forged,
// expired, or already-consumed handle all collapse to null → a single 4xx
// no-cookie rejection with no distinguishing signal (no oracle).
//
// AM-1 (absent/empty code guard): an absent or empty `code` query param takes
// the SAME 4xx no-cookie path as a forged handle, and store.consume is NEVER
// called with a null/empty argument — the guard runs textually BEFORE the store
// call, so no malformed input reaches the store (preserves the no-oracle
// property and prevents a malformed-input crash).
//
// D-08 (responses): a valid handle → 302 to the sanitizeNext-validated `next`
// (default /) with the partitioned cookie(s) set; a bad/absent/empty handle →
// 4xx with NO Set-Cookie. A thrown store error is an operational failure
// (Phase 1 D-13) and propagates as a 5xx — it is NOT caught/masked here.
//
// D-13 (popup-only for v0.1): consume sets the CHIPS-partitioned cookie and has
// NO `mode` parameter and NO PWA branch. The cookie-attribute logic is factored
// behind an internal cookie-writer that takes the attribute set as input, so
// v0.2 can add the regular (non-partitioned) PWA path additively without
// reshaping this route.
//
// D-17 (Max-Age): the re-set chunks omit Max-Age by default (session-scoped —
// the source lifetime is not capturable from the request, D-03); an explicit
// options.maxAge is threaded through to every emitted Set-Cookie.
//
// D-12 / D-14 (Origin allowlist, defense-in-depth): a PRESENT but disallowed
// Origin → 4xx (store NOT reached); an ABSENT Origin passes through to the real
// gate (the popup's 302-driven navigation to /auth/consume legitimately carries
// no Origin — D-14). Complementary control, NOT the security boundary (the
// boundary is the one-time opaque handle).
//
// D-06: the returned handler is a plain Web-standard
// `(request) => Promise<Response>` closure — no Next.js runtime coupling, driven
// directly on the Vitest bench.

import type { AuthBridgeOptions } from "./types.js";
import type { TransferPayload } from "./transfer-store/types.js";
import { sanitizeNext } from "./auth-helpers.js";
import { serializeSetCookie } from "./cookie-codec.js";

/**
 * Bad/absent/empty handle → 400 with NO Set-Cookie (D-08 / AM-1 / THREAT-06).
 *
 * 400 (not 401) is the consume bad-handle code: 401 is reserved for the bridge
 * no-session refusal (D-07), keeping the two failure modes separable. A bare
 * Response with no body detail and no Set-Cookie — there is no oracle and no
 * cookie ever leaks on a rejection.
 */
function reject(): Response {
  return new Response(null, { status: 400 });
}

/**
 * The factored partitioned cookie-writer (D-13): append ONE Set-Cookie header
 * per stored chunk, each carrying the hardened CHIPS floors (Secure, HttpOnly,
 * SameSite=None, Path=/, Partitioned) via {@link serializeSetCookie}, and
 * threading the optional `maxAge` (D-17).
 *
 * It takes the attribute inputs (here: only `maxAge`) as a parameter rather than
 * hard-coding the full popup attribute set inline, so v0.2 can add the regular
 * (non-partitioned) PWA cookie path by passing a different attribute set —
 * additive, no route reshape (D-13).
 *
 * Each chunk MUST be its own `Set-Cookie` header (Headers.append), NEVER a
 * single comma-joined value — Set-Cookie is special-cased by the Fetch API and
 * must never be folded (Pattern 2 / Pitfall 1).
 */
function writeChunkCookies(
  headers: Headers,
  payload: TransferPayload,
  opts: { maxAge?: number },
): void {
  for (const chunk of payload) {
    headers.append(
      "Set-Cookie",
      serializeSetCookie(chunk.name, chunk.value, { maxAge: opts.maxAge }),
    );
  }
}

/**
 * Build the `/auth/consume` request handler from one config (ROUTE-03 / D-10).
 *
 * The returned closure runs in this exact, commented order:
 *   1. Origin check (D-12/D-14)  — present-but-disallowed → 4xx; absent → pass
 *   2. AM-1 guard                — absent/empty `code` → 4xx, store NOT reached
 *   3. Exchange (THREAT-06)      — store.consume(code); null → 4xx no-cookie
 *   4. Resolve target (D-09)     — sanitizeNext(next), unsafe degrades to "/"
 *   5. Write cookies (D-13/D-17) — one partitioned Set-Cookie per chunk
 *   6. Respond (D-08)            — 302 to the sanitized Location
 */
export function createConsumeHandler(
  options: AuthBridgeOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    // 1. Origin check (D-12/D-14) — defense-in-depth, NOT the security boundary
    // (the boundary is the one-time opaque handle). A PRESENT Origin not in the
    // allowlist is rejected (4xx); an ABSENT Origin passes through to the real
    // gate — the popup's 302-driven navigation legitimately carries no Origin.
    const origin = request.headers.get("Origin");
    if (origin !== null && !options.allowedOrigins.includes(origin)) {
      return reject();
    }

    const params = new URL(request.url).searchParams;
    const code = params.get("code");
    const next = params.get("next");

    // 2. AM-1 guard — an absent or empty `code` takes the SAME 4xx no-cookie
    // path as a forged handle, and store.consume is NEVER called with a
    // null/empty argument. This guard runs BEFORE the store call, so no
    // malformed input reaches the store (no oracle, no crash).
    if (!code) {
      return reject();
    }

    // 3. Exchange (THREAT-06) — the atomic, delete-first, null-on-miss store
    // gate (Phase 1 D-03/D-09). Forged / expired / already-consumed all collapse
    // to null → one 4xx no-cookie rejection with no distinguishing signal. A
    // thrown store error is operational (Phase 1 D-13) and propagates as a 5xx —
    // deliberately NOT caught here.
    const payload = await options.store.consume(code);
    if (payload === null) {
      return reject();
    }

    // 4. Resolve the redirect target (D-09) — sanitizeNext degrades an unsafe
    // `next` (the /auth namespace, absolute, or protocol-relative) to "/"; the
    // attacker target is never honored (ROUTE-06 / THREAT-08).
    const location = sanitizeNext(next);

    // 5. Write the partitioned cookies (D-13 / D-17) — one Set-Cookie per stored
    // chunk via the factored writer, each carrying the hardened CHIPS floors and
    // the optional Max-Age.
    const headers = new Headers();
    writeChunkCookies(headers, payload, { maxAge: options.maxAge });

    // 6. Respond (D-08) — 302 to the sanitized Location with the cookies set.
    // There is NO `mode` parameter and NO PWA branch (D-13 — popup-only for
    // v0.1).
    headers.set("Location", location);
    return new Response(null, { status: 302, headers });
  };
}
