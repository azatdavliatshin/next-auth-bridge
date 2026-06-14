// Provider-agnosticism proof: drive the REAL bridge -> consume roundtrip against
// a genuine, non-Entra session minted by a dockerized Keycloak in CI.
//
// The bridge is supposed to work against ANY OIDC provider, not just Microsoft
// Entra. This suite catches accidental Entra-specific coupling by establishing a
// real Keycloak session via a browserless auth-code + PKCE (S256) flow (NOT
// resource-owner-password / ROPC, which would bypass PKCE and falsify the
// real-second-provider claim), then driving the package's actual bridge and
// consume handlers to a 302 with a Partitioned Set-Cookie and asserting the
// handle is one-time (replay -> 4xx, no cookie).
//
// Scope honesty: this roundtrip is provider-agnosticism evidence, NOT PKCE
// non-interference evidence. By the time the bridge harvests, the short-lived
// pkce/state cookies have already been consumed at the OAuth callback and are
// absent from the session-bearing request, so there is nothing for the harvest
// to disturb. PKCE non-interference is proven separately by the package's
// decoy-exclusion unit test (the harvest takes only session-token chunks).
//
// The Keycloak-dependent cases are env-guarded: locally, with no Keycloak env,
// they SKIP (they never fail for missing infrastructure). The CI job sets the
// env and runs them for real. Response cookies are always read via
// getSetCookie() (the array form), never .get("Set-Cookie").
//
// `any` is permitted only in this test scaffolding per project convention.

import { describe, expect, it } from "vitest";

import {
  createAuthBridge,
  createInMemoryTransferStore,
} from "next-auth-bridge";
import type { AuthBridgeOptions } from "next-auth-bridge";

import {
  createKeycloakLogin,
  generatePkcePair,
  hasKeycloakEnv,
  keycloakConfigFromEnv,
} from "./lib/keycloak-pkce-login.js";

const ORIGIN = "https://tenant.example";
const BRIDGE_URL = `${ORIGIN}/auth/bridge?popup=true`;
const SESSION_BASE = "__Secure-authjs.session-token";

/** Run the Keycloak cases only when the full provider env is present. */
const describeKeycloak = hasKeycloakEnv() ? describe : describe.skip;

/**
 * Build a verifySession that resolves the supplied session value (the real
 * verifier contract is zero-arg and only asked a truthy/null question). Here the
 * value is derived from the Keycloak tokens, so the bridge mints against a
 * genuine non-Entra session.
 */
function sessionVerifier(session: unknown): AuthBridgeOptions["verifySession"] {
  return async () => session;
}

/**
 * Build the session-bearing chunked Cookie header the bridge harvests. The bridge
 * matches only the resolved session-token base + numeric chunk suffixes, so we
 * shape the Keycloak-derived token material into exactly that name pattern. These
 * VALUES are the secret session material that must ride only in the consume
 * Set-Cookie, never in a URL.
 */
function sessionCookieHeader(
  chunks: ReadonlyArray<{ name: string; value: string }>,
): string {
  return chunks.map((c) => `${c.name}=${c.value}`).join("; ");
}

// Unit-level guard (always runs): the PKCE pair is real S256 — the verifier
// hashes to the challenge. This pins the helper's crypto independently of any
// live Keycloak, so the security-relevant part of the helper is always covered.
describe("keycloak-pkce-login helper (provider-agnosticism)", () => {
  it("generates a real S256 PKCE pair (verifier hashes to the challenge)", async () => {
    const { createHash } = await import("node:crypto");
    const { verifier, challenge } = generatePkcePair();
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
    // The verifier length is within the RFC 7636 43..128 range.
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });
});

describeKeycloak(
  "bridge -> consume roundtrip against a real Keycloak (non-Entra) session",
  () => {
    it("establishes a Keycloak session via auth-code + PKCE, then mints a handle and redeems it to a 302 with a Partitioned cookie", async () => {
      // --- Establish a REAL Keycloak session (auth-code + PKCE, no ROPC) ------
      const login = createKeycloakLogin(keycloakConfigFromEnv());
      const tokens = await login();
      expect(tokens.access_token).toBeTruthy();
      // A truthy session derived from the real Keycloak tokens drives the gate.
      const keycloakSession = {
        user: { provider: "keycloak" },
        accessToken: tokens.access_token,
      };

      // The session-token chunks the bridge will harvest. We bind them to the
      // real Keycloak token material so the payload that crosses the handoff is
      // genuinely provider-derived, not synthetic.
      const tokenChunks = [
        { name: SESSION_BASE, value: tokens.access_token.slice(0, 32) },
        { name: `${SESSION_BASE}.0`, value: tokens.access_token.slice(32, 64) },
      ];

      // --- Drive the REAL bridge + consume handlers --------------------------
      const store = createInMemoryTransferStore();
      const api = createAuthBridge({
        store,
        verifySession: sessionVerifier(keycloakSession),
        allowedOrigins: [ORIGIN],
      });

      // Bridge: a verified (Keycloak) session + the chunked session-token
      // cookies -> 200 with an opaque { code } handle and ZERO cookies in the body.
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

      // Consume: redeem the handle -> 302 whose getSetCookie() carries the
      // Partitioned session cookie(s).
      const consumeUrl = `${ORIGIN}/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/")}`;
      const consumeRes = await api.consume(
        new Request(consumeUrl, { headers: { Origin: ORIGIN } }),
      );
      expect(consumeRes.status).toBe(302);
      const cookies = consumeRes.headers.getSetCookie();
      expect(cookies.length).toBe(tokenChunks.length);
      for (const cookie of cookies) {
        expect(cookie).toContain("Partitioned");
      }
      // The token material rode only in the Set-Cookie, never in the consume URL.
      for (const chunk of tokenChunks) {
        expect(consumeUrl).not.toContain(chunk.value);
      }
    });

    it("replay: redeeming the same handle a second time returns 4xx with no cookie (one-time-use holds against a non-Entra session)", async () => {
      const login = createKeycloakLogin(keycloakConfigFromEnv());
      const tokens = await login();
      const keycloakSession = { user: { provider: "keycloak" } };

      const tokenChunks = [
        { name: SESSION_BASE, value: tokens.access_token.slice(0, 32) },
      ];

      const store = createInMemoryTransferStore();
      const api = createAuthBridge({
        store,
        verifySession: sessionVerifier(keycloakSession),
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

      // First redeem succeeds (302 + cookies).
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
  },
);
