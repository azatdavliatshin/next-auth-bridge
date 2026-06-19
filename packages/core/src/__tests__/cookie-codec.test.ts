// AGNOSTIC-02 — function-boundary isolation test for harvestSessionChunks.
//
// Proves the harvest filter handles Better Auth's single opaque session cookie:
// it harvests EXACTLY the one un-suffixed session cookie (the `name === base`
// branch) and excludes adversarial near-misses (`${base}.sig`, `${base}_x`) and
// the real Better Auth sibling cookies (session_data / account_data /
// dont_remember). This is the cheapest de-risk of the session-strategy-agnostic
// claim — it pins the shipped guard (cookie-codec.ts:67-71) through observable
// output (D-01, D-02, D-10 confirm-only — cookie-codec.ts is NOT edited).

import { describe, expect, it } from "vitest";

import { harvestSessionChunks } from "../cookie-codec.js";

describe("harvestSessionChunks (AGNOSTIC-02 — single opaque Better Auth session cookie)", () => {
  // The Better Auth default session-token base (dev / non-secure). The `__Secure-`
  // prefix in production prefixes the whole name; the harvest guard is agnostic to
  // the literal — it matches whatever base is resolved.
  const base = "better-auth.session_token";

  it("harvests exactly one opaque Better Auth session cookie, excluding .sig/_x near-misses and real BA sibling cookies", () => {
    // A realistic Better Auth cookie jar: the one real un-suffixed session
    // cookie, the two spec'd near-misses, and the three VERIFIED default BA
    // sibling cookies. Note: BA's CSRF is Origin-header based — there is no
    // csrf_token / state cookie to exclude (a realistic fact, not an omission).
    const jar = new Map<string, string>([
      [base, "opaque-session-value"], // the one real hit (name === base)
      [`${base}.sig`, "near-miss-nonnumeric"], // excluded: suffix "sig" fails /^\d+$/
      [`${base}_x`, "near-miss-underscore"], // excluded: does not start with base + "."
      ["better-auth.session_data", "decoy-1"], // real BA sibling — VERIFIED, no base match
      ["better-auth.account_data", "decoy-2"], // real BA sibling — VERIFIED, no base match
      ["better-auth.dont_remember", "decoy-3"], // real BA sibling — VERIFIED, no base match
    ]);

    const harvested = harvestSessionChunks(jar, base);

    // EXACTLY one — the count is the proof. If the /^\d+$/ suffix guard were
    // loosened, `${base}.sig` would leak in and this assertion would fail (D-02).
    expect(harvested.length).toBe(1);
    expect(harvested[0]?.name).toBe(base);

    // None of the near-misses or BA siblings are present in the harvest.
    const names = harvested.map((c) => c.name);
    expect(names).not.toContain(`${base}.sig`);
    expect(names).not.toContain(`${base}_x`);
    expect(names).not.toContain("better-auth.session_data");
    expect(names).not.toContain("better-auth.account_data");
    expect(names).not.toContain("better-auth.dont_remember");
  });

  it("harvests every numeric chunk ${base}.0 / ${base}.1 (the Auth.js chunk path still works)", () => {
    // Pins the guard in the OTHER direction (D-04): integer-suffixed chunk names
    // ARE harvested. Kept as a separate case so it does not dilute the
    // single-opaque narrative above.
    const jar2 = new Map<string, string>([
      [base, "v"],
      [`${base}.0`, "c0"],
      [`${base}.1`, "c1"],
    ]);

    expect(harvestSessionChunks(jar2, base).length).toBe(3);
  });
});
