// next-auth-bridge — the in-memory TransferStore adapter (STORE-02).
//
// The non-negotiable test-bench backend: a single-process, dependency-free
// store the Vitest suite drives directly (no real KV, no network). It is also
// where STORE-05 (one-time-use) and STORE-06 (TTL expiry) are proven against a
// concrete store with no network in the loop.
//
// Security-critical structure:
//   - Single entropy site (D-01): the code comes from generateCode() and never
//     from a local CSPRNG call here — there is exactly one auditable entropy
//     source for the whole package.
//   - Atomic delete-FIRST then validate (D-09 / Pitfall 1): consume() reads the
//     entry and deletes it synchronously before any await yields, so two
//     concurrent consumes can never both observe the same entry. One-time-use
//     is guaranteed structurally, not by timing.
//   - Lazy expiry against an injected clock (D-08 / D-14): expiry is checked on
//     read against this.now(), so no timers, no background sweeps, fully
//     deterministic under test.
//   - Construction-time TTL guard (D-07): ttlSeconds > 60 throws loudly at
//     construction (resolved Open Question 2) rather than silently clamping.
//   - Miss = null (D-03 / D-13): not-found / expired / already-consumed all
//     collapse to null with no per-mode branch; only operational failures throw.
//   - Stored entry carries NO mode-discriminating field (D-06).

import type {
  TransferPayload,
  TransferStore,
  TransferStoreOptions,
} from "./types.js";
import { generateCode } from "./generate-code.js";

/** The maximum permitted TTL (seconds). Codes are short-lived handles. */
const MAX_TTL_SECONDS = 60;

/**
 * What the store holds per code. Mode-agnostic (D-06): just the payload and the
 * absolute expiry instant — no popup/PWA/transport discriminator.
 */
interface StoredEntry {
  payload: TransferPayload;
  /** Absolute expiry instant in ms (create-time clock + ttlSeconds * 1000). */
  expiresAt: number;
}

/**
 * Create an in-memory, single-process {@link TransferStore}. Dependency-free;
 * intended for the Vitest bench and as the reference implementation of the
 * store's security invariants (STORE-02).
 *
 * Functional/factory style (no classes — see CLAUDE.md): the `Map`, the resolved
 * `ttlSeconds`, and the `now` clock are captured in the closure, which makes them
 * genuinely unreachable from outside the returned object (stronger encapsulation
 * than `private` fields, which are erased at runtime).
 *
 * @param options.ttlSeconds Per-store TTL, default 60. THROWS if > 60 (D-07):
 *   a loud misconfiguration rather than a silent clamp that could mask a
 *   security-relevant config mistake.
 * @param options.now Injectable clock seam (D-14), default `Date.now`. Tests
 *   advance a controllable clock instead of waiting on real time.
 */
export function createInMemoryTransferStore(
  options: TransferStoreOptions = {},
): TransferStore {
  const { ttlSeconds = MAX_TTL_SECONDS, now = Date.now } = options;
  if (ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error(
      `createInMemoryTransferStore: ttlSeconds must be <= ${MAX_TTL_SECONDS} (got ${ttlSeconds})`,
    );
  }

  const store = new Map<string, StoredEntry>();

  return {
    /**
     * Persist `payload` under a freshly minted 256-bit code (D-01) and return
     * the code. The store mints the entropy — callers never supply it.
     */
    async create(payload: TransferPayload): Promise<{ code: string }> {
      const code = generateCode();
      const expiresAt = now() + ttlSeconds * 1000;
      store.set(code, { payload, expiresAt });
      return { code };
    },

    /**
     * Atomically remove and return the payload for `code`, or null on any miss.
     *
     * The read + delete happen synchronously before this async function yields
     * at any await, so two concurrent consumes can never both observe the entry
     * (D-09 / Pitfall 1). Expiry is checked lazily against the injected clock
     * (D-08): an expired entry was already deleted above, so it returns null and
     * is gone. not-found / expired / already-consumed all collapse to null with
     * no distinguishing signal (D-03).
     */
    async consume(code: string): Promise<TransferPayload | null> {
      // Delete-FIRST: read then remove synchronously, before any await yields.
      const entry = store.get(code);
      store.delete(code);

      if (entry === undefined) {
        return null; // not-found (or already-consumed by a prior/concurrent call)
      }
      if (now() >= entry.expiresAt) {
        return null; // lazily expired — entry already deleted above
      }
      return entry.payload;
    },
  };
}
