// next-auth-bridge — the production "Vercel KV" TransferStore adapter, built on
// the non-deprecated @upstash/redis client (D-10).
//
// STORE-03: serverless invocations do NOT share process memory, so an in-memory
// store fails the cross-context roundtrip by construction. This adapter holds the
// one-time code in KV, shared across invocations, with two security-critical SDK
// primitives:
//   - native `set(key, value, { ex })` for TTL (D-08): the backend evicts the
//     handle when it expires — no manual expiresAt bookkeeping in the adapter.
//   - atomic `getdel` for one-time-use (D-09): a SINGLE server-side GETDEL with no
//     get-then-delete window, so a replay / concurrent consume can never both win.
//
// Dependency isolation (D-11): this file is the `./store/kv` subpath entry. ONLY
// consumers importing the subpath pull in @upstash/redis (declared an optional
// peerDependency); the main entry never imports it. Do NOT re-export this from
// src/index.ts.
//
// Serialization (D-05 / resolved Open Question 1): the @upstash/redis SDK
// auto-(de)serializes values. The adapter passes the typed `TransferPayload`
// straight to `set` and reads it back via `getdel<TransferPayload>` — it does NOT
// manually encode/decode the payload, which would double-encode and silently
// malform it (RESEARCH Pitfall 3).

import { Redis } from "@upstash/redis";

import { generateCode } from "./generate-code.js";
import type {
  TransferPayload,
  TransferStore,
  TransferStoreOptions,
} from "./types.js";

/** The default and maximum TTL for a transfer handle, in seconds (D-07). */
const MAX_TTL_SECONDS = 60;

/**
 * The minimal structural shape of the @upstash/redis client the adapter relies
 * on. Typing the injected dependency by this surface (rather than the full
 * `Redis` type) lets the clock-aware FakeUpstashRedis satisfy it in the contract
 * suite without `any`, while the real `Redis` client also conforms.
 */
export interface KVRedisClient {
  /** Native TTL write (D-08): the backend evicts after `ex` seconds. */
  set(
    key: string,
    value: TransferPayload,
    opts: { ex: number },
  ): Promise<unknown>;
  /** Atomic read-and-delete (D-09): one server-side command, no race window. */
  getdel<T>(key: string): Promise<T | null>;
}

/**
 * Construction options for {@link createKVTransferStore}: the shared
 * {@link TransferStoreOptions} extended with an injectable Redis client.
 *
 * When `redis` is omitted the adapter constructs one via `Redis.fromEnv()`,
 * which reads `UPSTASH_REDIS_REST_URL` (|| `KV_REST_API_URL`) and
 * `UPSTASH_REDIS_REST_TOKEN` (|| `KV_REST_API_TOKEN`) — the env wiring Phase 5
 * provisions for the Vercel preview.
 */
export interface KVTransferStoreOptions extends TransferStoreOptions {
  redis?: KVRedisClient;
}

/**
 * Create the "Vercel KV" TransferStore adapter on @upstash/redis (STORE-03).
 *
 * Functional/factory style (no classes — see CLAUDE.md): the resolved Redis
 * client and `ttlSeconds` are captured in the closure.
 *
 * Expiry is owned by the backend's native EX eviction (D-08), so this adapter
 * keeps no local clock state; the `now` seam from {@link TransferStoreOptions} is
 * accepted for a uniform factory signature (the contract suite injects the same
 * clock into the fake client) but the adapter never reads wall-clock time itself.
 */
export function createKVTransferStore(
  options: KVTransferStoreOptions = {},
): TransferStore {
  const ttlSeconds = options.ttlSeconds ?? MAX_TTL_SECONDS;
  // D-07 / resolved Open Question 2: a TTL over the cap is a loud
  // misconfiguration — THROW at construction, never silently clamp.
  if (ttlSeconds > MAX_TTL_SECONDS) {
    throw new RangeError(
      `ttlSeconds must be <= ${MAX_TTL_SECONDS} (got ${ttlSeconds})`,
    );
  }
  // Default the client to Redis.fromEnv() when none is injected. The real
  // `Redis` client conforms to the KVRedisClient surface used here.
  const redis: KVRedisClient =
    options.redis ?? (Redis.fromEnv() as unknown as KVRedisClient);

  return {
    async create(payload: TransferPayload): Promise<{ code: string }> {
      // generateCode() is the single 256-bit CSPRNG entropy site (D-01); the
      // adapter MUST NOT re-implement entropy or call the crypto primitive.
      const code = generateCode();
      // Native EX TTL (D-08). The SDK auto-serializes the payload on the
      // adapter's behalf (D-05 / resolved Open Question 1) — pass the typed
      // object straight through, with no manual string encoding.
      await redis.set(code, payload, { ex: ttlSeconds });
      return { code };
    },

    async consume(code: string): Promise<TransferPayload | null> {
      // Atomic read+delete (D-09): one-time-use enforced server-side, no
      // get-then-delete window. The SDK auto-deserializes into TransferPayload
      // (D-05) — no manual decode. `null` is returned on any miss (not-found,
      // expired, already-consumed all collapse to null, D-03). Genuine
      // operational failures (KV unreachable, deserialization error) PROPAGATE
      // as throws (D-13) — they are NOT caught and masked as a benign miss.
      return await redis.getdel<TransferPayload>(code);
    },
  };
}
