// Pitfall-1 regression lock (T-08-01).
//
// The bridge harvests the cookie named `getBetterAuthCookieName({ secure })`. If the
// name Better Auth actually EMITS diverges from that, the harvest finds nothing and
// the handoff silently produces a signed-out tenant.
//
// CRITICAL (the bug this now guards): Better Auth ALWAYS prepends the secure prefix
// itself when useSecureCookies is on (createCookieGetter: `${secureCookiePrefix}${name}`).
// So `advanced.cookies.session_token.name` must be the BASE (unprefixed) name; the
// EMITTED name is base + prefix. Asserting only the configured `name` (as an earlier
// version did) let a doubled `__Secure-__Secure-...` cookie ship — the live failure.
// This test therefore resolves the name Better Auth REALLY emits (via auth.$context)
// and pins THAT to the helper, catching the double-prefix.
//
// `any` is permitted ONLY in this test scaffolding per CLAUDE.md.

import { beforeAll, describe, expect, it } from "vitest";

import { getBetterAuthCookieName } from "next-auth-bridge";

beforeAll(() => {
  // NODE_ENV=production so the secure branch (the deploy path, where the double
  // prefix actually bit) is what's exercised. (Cast: @types/node marks NODE_ENV
  // readonly; overriding it in a test is intentional.)
  (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.AUTH_KEYCLOAK_ID = "bridge-example-app";
  process.env.AUTH_KEYCLOAK_SECRET = "test-secret";
  process.env.AUTH_KEYCLOAK_ISSUER =
    "https://keycloak.example.test/realms/bridge-agnosticism";
  process.env.BETTER_AUTH_URL = "https://nab-ba-tenant.vercel.app";
  process.env.BETTER_AUTH_SECRET = "x".repeat(40);
  // Under NODE_ENV=production, lib/db.ts requires TURSO_DATABASE_URL (the deploy
  // guard). Point at a placeholder libsql URL so the config resolves via the Turso
  // branch — this suite only inspects the cookie name, never opens the DB.
  process.env.TURSO_DATABASE_URL = "libsql://placeholder.turso.io";
  process.env.TURSO_AUTH_TOKEN = "placeholder";
});

/** The cookie name Better Auth actually emits (base + its own secure prefix). */
async function emittedSessionCookieName(): Promise<string> {
  const mod = await import("@/lib/auth");
  const ctx = await (mod.auth as any).$context;
  const cookies = ctx?.authCookies ?? ctx?.cookies;
  return cookies?.sessionToken?.name ?? cookies?.session_token?.name;
}

describe("emitted BA cookie name === getBetterAuthCookieName (Pitfall 1)", () => {
  it("the helper returns the prefixed name for secure and the bare name for non-secure", () => {
    expect(getBetterAuthCookieName({ secure: true })).toBe(
      "__Secure-better-auth.session_token",
    );
    expect(getBetterAuthCookieName({ secure: false })).toBe(
      "better-auth.session_token",
    );
  });

  it("the name Better Auth EMITS equals the prefixed helper name (no double prefix)", async () => {
    const emitted = await emittedSessionCookieName();

    // In the production/secure env, the emitted name must be EXACTLY the single-
    // prefixed helper name — not `__Secure-__Secure-...`.
    expect(emitted).toBe(getBetterAuthCookieName({ secure: true }));
    expect(emitted).not.toContain("__Secure-__Secure-");
  });

  it("the emitted name equals what the bridge harvests (sessionCookieName)", async () => {
    const emitted = await emittedSessionCookieName();
    const mod = await import("@/lib/auth");
    // The re-exported sessionCookieName is what lib/auth-bridge.ts feeds the harvest.
    expect(mod.sessionCookieName).toBe(emitted);
  });
});
