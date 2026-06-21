// Pitfall-1 regression lock (T-08-01).
//
// The bridge harvests the cookie named `getBetterAuthCookieName({ secure })`. If the
// name Better Auth is configured to EMIT diverges from that, the harvest finds
// nothing and the handoff silently produces a signed-out tenant. Better Auth does NOT
// auto-add the `__Secure-` prefix the way Auth.js does, so the name is set explicitly
// in lib/auth.ts — and DERIVED from the helper, never a hardcoded literal (AGNOSTIC-05).
//
// This test pins three things:
//   1. The helper's own contract for BOTH bases (secure / non-secure).
//   2. The name lib/auth.ts is configured to emit (read from auth.options) === the
//      helper's output for the current `secure` value.
//   3. The re-exported `sessionCookieName` agrees with the configured option.
//
// `any` is permitted ONLY in this test scaffolding per CLAUDE.md.

import { beforeAll, describe, expect, it } from "vitest";

import { getBetterAuthCookieName } from "next-auth-bridge";

beforeAll(() => {
  process.env.AUTH_KEYCLOAK_ID = "bridge-example-app";
  process.env.AUTH_KEYCLOAK_SECRET = "test-secret";
  process.env.AUTH_KEYCLOAK_ISSUER =
    "https://keycloak.example.test/realms/bridge-agnosticism";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = "x".repeat(40);
  process.env.BA_SQLITE_PATH = "ba.sqlite";
});

describe("emitted BA cookie name === getBetterAuthCookieName (Pitfall 1)", () => {
  it("the helper returns the prefixed name for secure and the bare name for non-secure", () => {
    // Both bases are pinned so a change to either branch is caught here.
    expect(getBetterAuthCookieName({ secure: true })).toBe(
      "__Secure-better-auth.session_token",
    );
    expect(getBetterAuthCookieName({ secure: false })).toBe(
      "better-auth.session_token",
    );
  });

  it("the configured advanced.cookies.session_token.name matches the helper for the current env", async () => {
    const mod = await import("@/lib/auth");
    const auth = mod.auth as any;

    const configuredName: string =
      auth?.options?.advanced?.cookies?.session_token?.name;
    expect(typeof configuredName).toBe("string");

    // Recompute the expected name exactly as lib/auth.ts does — from the helper,
    // keyed on the same `secure` flag — so the configured value is proven to track
    // the helper rather than a divergent hardcoded string.
    const secure = process.env.NODE_ENV === "production";
    const expectedName = getBetterAuthCookieName({ secure });

    expect(configuredName).toBe(expectedName);

    // The configured name must be one of the two helper bases (never some third
    // hand-typed literal that happened to match in this env).
    expect([
      getBetterAuthCookieName({ secure: true }),
      getBetterAuthCookieName({ secure: false }),
    ]).toContain(configuredName);
  });

  it("the re-exported sessionCookieName agrees with the configured option", async () => {
    const mod = await import("@/lib/auth");
    const auth = mod.auth as any;
    const configuredName: string =
      auth?.options?.advanced?.cookies?.session_token?.name;
    expect(mod.sessionCookieName).toBe(configuredName);
  });
});
