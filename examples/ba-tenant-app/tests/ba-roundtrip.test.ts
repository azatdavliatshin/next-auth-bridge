// Auth-library-agnosticism proof (Better Auth side): drive the REAL bridge ->
// consume roundtrip against a Better Auth SINGLE-OPAQUE-COOKIE session.
//
// The whole v0.3 thesis is that the bridge/consume core is auth-library-agnostic:
// the Auth.js set proved it against the chunked `__Secure-authjs.session-token`
// cookie; this suite proves the SAME core handles Better Auth's single opaque
// `__Secure-better-auth.session_token` cookie — no numeric chunks, just one entry.
// Phase 7's cookie-codec test already proved the single-opaque-cookie HARVEST in
// the package; this end-to-end roundtrip locks BAEXAMPLE-02 at the Node level.
//
// This is the BA analog of keycloak-roundtrip.test.ts. The deltas from that file:
//   - SESSION_BASE is DERIVED from getBetterAuthCookieName({ secure: true }) — the
//     Phase 7 helper, never a hardcoded `__Secure-better-auth` literal (AGNOSTIC-05).
//   - tokenChunks is a SINGLE { name: SESSION_BASE, value } entry (Better Auth
//     ships one opaque cookie), not the chunked shape Auth.js uses.
//   - The roundtrip ALWAYS RUNS: it uses an in-memory store + a synthetic truthy
//     session (no live Keycloak / no DB), so it is a deterministic regression lock,
//     not an env-guarded case.
//
// `any` is permitted ONLY in this test scaffolding per CLAUDE.md (none is needed
// here, but the convention applies).

import { describe, expect, it } from "vitest";

import {
  createAuthBridge,
  createInMemoryTransferStore,
  getBetterAuthCookieName,
} from "next-auth-bridge";
import type { AuthBridgeOptions } from "next-auth-bridge";

const ORIGIN = "https://tenant.example";
const BRIDGE_URL = `${ORIGIN}/auth/bridge?popup=true`;

// DERIVED, never hardcoded — the dev/prod literal-mismatch trap AGNOSTIC-05 closed.
// secure: true => the `__Secure-`-prefixed production base name the bridge harvests.
const SESSION_BASE = getBetterAuthCookieName({ secure: true });

/**
 * Build a verifySession that resolves the supplied session value. The real
 * verifier contract is zero-arg and only asked a truthy/null question; Better
 * Auth's getSession returns `{ session, user } | null`, so a truthy object stands
 * in for a genuine BA session here.
 */
function sessionVerifier(session: unknown): AuthBridgeOptions["verifySession"] {
  return async () => session;
}

/** Build the Cookie header carrying the single opaque BA session cookie. */
function sessionCookieHeader(
  chunks: ReadonlyArray<{ name: string; value: string }>,
): string {
  return chunks.map((c) => `${c.name}=${c.value}`).join("; ");
}

describe("bridge -> consume roundtrip against a Better Auth single-opaque-cookie session", () => {
  it("mints a handle against a BA session and redeems it to a 302 with a Partitioned cookie", async () => {
    // A truthy synthetic BA session drives the gate (the shape getSession returns).
    const baSession = { session: { id: "sess_1" }, user: { id: "u_1" } };

    // Better Auth ships ONE opaque session cookie — a SINGLE entry, no numeric
    // chunks. This VALUE is the secret session material that must ride only in the
    // consume Set-Cookie, never in a URL.
    const tokenChunks = [
      {
        name: SESSION_BASE,
        value: "ba_opaque_session_token_value_0123456789abcdef",
      },
    ];

    const store = createInMemoryTransferStore();
    const api = createAuthBridge({
      store,
      verifySession: sessionVerifier(baSession),
      cookieName: SESSION_BASE,
      allowedOrigins: [ORIGIN],
    });

    // Bridge: a verified BA session + the single opaque session cookie -> 200 with
    // an opaque { code } handle and ZERO cookies in the body.
    const bridgeRes = await api.bridge(
      new Request(BRIDGE_URL, {
        headers: {
          Origin: ORIGIN,
          Cookie: sessionCookieHeader(tokenChunks),
        },
      }),
    );
    expect(bridgeRes.status).toBe(200);
    expect(bridgeRes.headers.getSetCookie().length).toBe(0);
    const { code } = (await bridgeRes.json()) as { code: string };
    expect(code).toMatch(/^[0-9a-f]{64}$/);

    // Consume: redeem the handle -> 302 whose getSetCookie() carries the single
    // Partitioned session cookie.
    const consumeUrl = `${ORIGIN}/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/")}`;
    const consumeRes = await api.consume(
      new Request(consumeUrl, { headers: { Origin: ORIGIN } }),
    );
    expect(consumeRes.status).toBe(302);
    const cookies = consumeRes.headers.getSetCookie();
    // A single opaque BA cookie -> exactly one Set-Cookie (not a chunked set).
    expect(cookies.length).toBe(tokenChunks.length);
    expect(cookies.length).toBe(1);
    for (const cookie of cookies) {
      expect(cookie).toContain("Partitioned");
    }
    // The opaque session value rode only in the Set-Cookie, never in the URL.
    for (const chunk of tokenChunks) {
      expect(consumeUrl).not.toContain(chunk.value);
    }
  });

  it("replay: redeeming the same handle a second time returns 4xx with no cookie (one-time-use holds for a single opaque BA cookie)", async () => {
    const baSession = { session: { id: "sess_2" }, user: { id: "u_2" } };
    const tokenChunks = [
      {
        name: SESSION_BASE,
        value: "ba_opaque_session_token_value_replay_fedcba9876543210",
      },
    ];

    const store = createInMemoryTransferStore();
    const api = createAuthBridge({
      store,
      verifySession: sessionVerifier(baSession),
      cookieName: SESSION_BASE,
      allowedOrigins: [ORIGIN],
    });

    const bridgeRes = await api.bridge(
      new Request(BRIDGE_URL, {
        headers: {
          Origin: ORIGIN,
          Cookie: sessionCookieHeader(tokenChunks),
        },
      }),
    );
    expect(bridgeRes.status).toBe(200);
    const { code } = (await bridgeRes.json()) as { code: string };

    const consumeUrl = `${ORIGIN}/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/")}`;

    // First redeem succeeds (302 + the single cookie).
    const first = await api.consume(
      new Request(consumeUrl, { headers: { Origin: ORIGIN } }),
    );
    expect(first.status).toBe(302);
    expect(first.headers.getSetCookie().length).toBe(tokenChunks.length);

    // Second redeem of the same handle: deleted on first read -> 4xx, no cookie.
    const replay = await api.consume(
      new Request(consumeUrl, { headers: { Origin: ORIGIN } }),
    );
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect(replay.headers.getSetCookie().length).toBe(0);
  });
});
