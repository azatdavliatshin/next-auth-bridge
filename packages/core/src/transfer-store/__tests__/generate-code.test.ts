// next-auth-bridge — entropy contract for the single code-generation site.
//
// THREAT-02 (entropy): a weak or guessable transfer handle is a Spoofing
// threat. STORE-04 requires 256-bit CSPRNG hex codes. This test asserts the
// provable contract: length 64, lowercase-hex charset, and uniqueness across
// a large sample. True bit-distribution randomness is structural (guaranteed
// by the single-site crypto.randomBytes call, D-01) and is not asserted here.

import { describe, expect, it } from "vitest";

import { generateCode } from "../generate-code.js";

describe("generateCode (STORE-04 / THREAT-02 entropy)", () => {
  it("generates 256-bit (64 lowercase-hex-char) codes", () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique codes across 10,000 generations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(generateCode());
    }
    expect(seen.size).toBe(10_000);
  });
});
