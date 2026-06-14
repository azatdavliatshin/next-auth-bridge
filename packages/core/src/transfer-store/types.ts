// next-auth-bridge — the locked TransferStore interface and its types.
//
// This interface freezes verbatim into v0.2 (the highest-leverage decision in
// the project). Every shape choice is made to survive the addition of Mode B's
// native-callback handles without a breaking change.

/**
 * The payload a caller hands to the store and gets back on consume.
 *
 * STORE-01 forward-compat constraint: this type is **mode-agnostic** — it MUST
 * carry no popup/PWA/mode-discriminating field (D-06). Both transports share
 * one store; a discriminator here would leak transport identity into the stored
 * shape and break the v0.2 forward-compat guarantee. As a bare array of
 * `{ name, value }` entries it carries no field that could be mistaken for a
 * transport discriminator.
 *
 * Finalized shape (Phase 2 D-01, resolved Open Question 3): an **array of
 * `{ name, value }` cookie-chunk entries**. The bridge captures EVERY Auth.js
 * session-token chunk (`__Secure-authjs.session-token`, `…​.0`, `…​.1`, …) from
 * the incoming request and consume re-sets each one verbatim — correct for
 * large/chunked JWTs and database-strategy sessions by construction, with no
 * silent truncation. This finalizes the field Phase 1 left provisional (Phase 1
 * D-04) WITHOUT reshaping the {@link TransferStore} interface.
 */
export type TransferPayload = Array<{ name: string; value: string }>;

/**
 * Construction options shared by every TransferStore adapter and by the
 * adapter-agnostic contract suite, so all stores share one signature.
 *
 * - `ttlSeconds` (D-07): per-store TTL, default 60s, REJECTED if > 60 (the
 *   adapter constructor throws — a loud misconfiguration, resolved Open
 *   Question 2). `create()` takes no TTL argument.
 * - `now` (D-14): injectable clock seam, defaults to `Date.now`. Expiry tests
 *   advance a controllable clock instead of using real waits or global timer
 *   mocks.
 */
export interface TransferStoreOptions {
  ttlSeconds?: number;
  now?: () => number;
}

/**
 * The mode-agnostic transfer store contract (D-01 / D-03).
 *
 * The store itself mints the code — callers never supply entropy — so the
 * 256-bit CSPRNG guarantee (STORE-04) holds by construction.
 */
export interface TransferStore {
  /**
   * Persist `payload` under a freshly generated 256-bit code and return the
   * code. Returns an object (never a bare string) so v0.2 can add fields such
   * as `expiresAt` additively without breaking consumers (D-02).
   */
  create(payload: TransferPayload): Promise<{ code: string }>;

  /**
   * Atomically remove and return the payload for `code`.
   *
   * Returns `null` on any miss — not-found, expired, or already-consumed all
   * collapse to `null` with no per-mode branch or timing signal (D-03). A
   * `null` carries no information about which miss occurred. Genuine
   * operational failures (backend unreachable, etc.) throw instead (D-13).
   */
  consume(code: string): Promise<TransferPayload | null>;
}
