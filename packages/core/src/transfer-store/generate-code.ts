// next-auth-bridge — the single transfer-code entropy site (D-01).
//
// THREAT-02 (entropy): the transfer handle MUST be a 256-bit CSPRNG value so
// it cannot be guessed or forged (STORE-04). Per D-01 the entropy lives in
// exactly ONE place: this module. No callsite supplies or influences a code,
// so "where does entropy come from?" has a single auditable answer. Using
// Node's platform CSPRNG (crypto.randomBytes) — never Math.random — is the
// guarantee-by-construction the locked decision was written to protect.

import { randomBytes } from "node:crypto";

/**
 * Generate a one-time transfer code.
 *
 * Returns 32 bytes (256 bits) of CSPRNG entropy as a 64-character lowercase
 * hex string. This is the only code-generation site in the package (D-01).
 */
export function generateCode(): string {
  return randomBytes(32).toString("hex"); // 32 bytes = 256 bits = 64 hex chars
}
