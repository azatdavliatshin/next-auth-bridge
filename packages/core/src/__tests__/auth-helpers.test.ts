// next-auth-bridge — tests for the pure auth-helpers (sanitizeNext + getAuthCookieName).
//
// THREAT-08 / ROUTE-06 (open-redirect): sanitizeNext is the server-side control
// that prevents a client-supplied `next` from redirecting the user off-site or
// back into the auth namespace. Every unsafe-target case below asserts the
// result is EXACTLY "/" — the attacker host/path is NEVER honored (D-09). These
// are the THREAT-08 negative tests; they are commented for Phase 4 threat-model
// traceability.
//
// D-16 (cookie-name resolution): getAuthCookieName must resolve the secure
// __Secure- prefix by default, the non-prefixed dev name under secure:false, and
// an explicit cookieName override above both — so the later harvest scope is
// exact, not over-broad.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import { getAuthCookieName, sanitizeNext } from "../auth-helpers.js";

describe("sanitizeNext (ROUTE-06 / THREAT-08 — open-redirect control)", () => {
  // ROUTE-06 — a safe, same-origin path passes through unchanged.
  it("passes a safe same-origin path through unchanged", () => {
    expect(sanitizeNext("/dashboard")).toBe("/dashboard");
  });

  // ROUTE-06 — falsy inputs degrade to the safe default "/".
  it("degrades null/undefined/empty to /", () => {
    expect(sanitizeNext(null)).toBe("/");
    expect(sanitizeNext(undefined)).toBe("/");
    expect(sanitizeNext("")).toBe("/");
  });

  // THREAT-08 — the auth namespace is rejected (the unsafe target is never honored).
  it("rejects /auth and /auth/* targets → /", () => {
    expect(sanitizeNext("/auth")).toBe("/");
    expect(sanitizeNext("/auth/signin")).toBe("/");
  });

  // THREAT-08 — the api/auth namespace is rejected.
  it("rejects /api/auth and /api/auth/* targets → /", () => {
    expect(sanitizeNext("/api/auth")).toBe("/");
    expect(sanitizeNext("/api/auth/callback/foo")).toBe("/");
  });

  // THREAT-08 — auth-namespace match is case-insensitive (no bypass via casing).
  it("rejects the auth namespace case-insensitively → /", () => {
    expect(sanitizeNext("/AUTH/signin")).toBe("/");
  });

  // THREAT-08 — an absolute URL is rejected; the attacker host is never the result.
  it("rejects an absolute URL → / (attacker host never honored)", () => {
    expect(sanitizeNext("https://evil.test/x")).toBe("/");
  });

  // THREAT-08 — a protocol-relative target is rejected; the attacker host is
  // never the result (the classic //evil.test open-redirect bypass).
  it("rejects a protocol-relative //evil target → / (attacker host never honored)", () => {
    expect(sanitizeNext("//evil.test/x")).toBe("/");
  });

  // THREAT-08 — a backslash-prefixed target is rejected. Browsers normalize "\"
  // to "/", so "/\evil.test" resolves to the protocol-relative "//evil.test"
  // (off-site). The "\" bypass must be rejected exactly like "//".
  it("rejects a backslash protocol-relative /\\evil target → / (CR-01 bypass)", () => {
    expect(sanitizeNext("/\\evil.test/x")).toBe("/");
    expect(sanitizeNext("/\\/evil.test")).toBe("/");
  });

  // THREAT-08 — a backslash anywhere in an otherwise-safe path is rejected
  // defensively; browser "\"→"/" normalization makes mid-path backslashes a
  // path-confusion risk in the Location header.
  it("rejects a path containing a backslash → /", () => {
    expect(sanitizeNext("/dashboard\\..\\evil")).toBe("/");
  });

  // THREAT-08 — a non-path / non-leading-slash target is rejected.
  it("rejects a relative non-leading-slash target → /", () => {
    expect(sanitizeNext("relative/no-slash")).toBe("/");
  });
});

describe("getAuthCookieName (D-16 — cookie-name resolution)", () => {
  // D-16 — secure-context default: the __Secure- prefixed name.
  it("resolves __Secure-authjs.session-token by default", () => {
    expect(getAuthCookieName({})).toBe("__Secure-authjs.session-token");
  });

  // D-16 — secure:false makes the non-prefixed dev/test name reachable.
  it("resolves the non-prefixed authjs.session-token under secure:false", () => {
    expect(getAuthCookieName({ secure: false })).toBe("authjs.session-token");
  });

  // D-16 — secure:true is the explicit secure-context default.
  it("resolves __Secure-authjs.session-token under secure:true", () => {
    expect(getAuthCookieName({ secure: true })).toBe(
      "__Secure-authjs.session-token",
    );
  });

  // D-11 — an explicit cookieName override wins, with precedence over secure.
  it("an explicit cookieName override wins over the secure default", () => {
    expect(getAuthCookieName({ cookieName: "custom.session" })).toBe(
      "custom.session",
    );
    expect(
      getAuthCookieName({ cookieName: "custom.session", secure: false }),
    ).toBe("custom.session");
  });
});
