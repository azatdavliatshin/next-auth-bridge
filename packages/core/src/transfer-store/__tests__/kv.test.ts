// next-auth-bridge — KV adapter tests.
//
// D-15: the KV adapter is driven through the SAME adapter-agnostic contract suite
// as the in-memory adapter (STORE-01/04/05/06), but against the clock-aware
// FakeUpstashRedis instead of a real Upstash REST roundtrip. The linchpin
// (RESEARCH Pitfall 2): the fake MUST receive the SAME injected `now` clock the
// contract suite advances, so native-EX expiry is modeled deterministically
// against that clock — never wall-clock time. The real KV roundtrip is exercised
// only by the Phase 5 Vercel preview (PROJECT.md constraint), never in Vitest.
//
// On top of the shared suite, this file adds KV-SPECIFIC assertions that the
// in-memory adapter cannot make: that create() issues a `set` carrying `{ ex }`
// equal to the configured ttlSeconds, that consume() routes through atomic
// `getdel`, and that a payload survives the set→getdel round-trip deeply equal
// and typed (proving the SDK auto-(de)serialization path is NOT double-encoded —
// resolved Open Question 1).
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import { createKVTransferStore } from "../kv.js";
import type { KVRedisClient } from "../kv.js";
import type {
  TransferPayload,
  TransferStore,
  TransferStoreOptions,
} from "../types.js";
import { createFakeUpstashRedis } from "./fake-upstash-redis.js";
import { runTransferStoreContract } from "./contract.js";

/**
 * Record of a single `set` call, so KV-specific tests can assert the adapter
 * issued native EX TTL with the configured ttlSeconds.
 */
interface RecordedSet {
  key: string;
  value: TransferPayload;
  ex: number;
}

/**
 * A recording wrapper around the clock-aware fake. It delegates every operation
 * to the underlying fake (preserving the SAME injected clock the contract suite
 * advances) while capturing `set` arguments — including the `{ ex }` TTL — for
 * KV-specific assertions. It satisfies the adapter's `KVRedisClient` surface.
 */
function createRecordingFake(now: () => number): {
  client: KVRedisClient;
  sets: RecordedSet[];
  getdelCalls: string[];
} {
  const inner = createFakeUpstashRedis(now);
  const sets: RecordedSet[] = [];
  const getdelCalls: string[] = [];
  const client: KVRedisClient = {
    async set(key, value, opts) {
      sets.push({ key, value, ex: opts.ex });
      return inner.set(key, value, { ex: opts.ex });
    },
    getdel<T>(key: string): Promise<T | null> {
      getdelCalls.push(key);
      return inner.getdel<T>(key);
    },
  };
  return { client, sets, getdelCalls };
}

// D-15 — drive the KV adapter through the shared contract suite using the
// clock-aware fake. CRITICAL (Pitfall 2): the fake receives the SAME `now` the
// suite injects and advances, so EX expiry is clock-driven, not real-time.
const makeStore = (opts: TransferStoreOptions): TransferStore =>
  createKVTransferStore({
    ...opts,
    redis: createFakeUpstashRedis(opts.now ?? Date.now),
  });

runTransferStoreContract(makeStore);

// KV-SPECIFIC behavior the shared suite cannot assert: that the adapter uses the
// native EX TTL and atomic getdel SDK primitives, and that the SDK
// (de)serialization path round-trips the payload without corruption.
describe("createKVTransferStore (kv adapter — @upstash/redis specifics)", () => {
  // D-01 — chunk-array payload (a `.0` + `.1` session-token chunk pair).
  const payload: TransferPayload = [
    { name: "__Secure-authjs.session-token.0", value: "chunk-zero-value" },
    { name: "__Secure-authjs.session-token.1", value: "chunk-one-value" },
  ];
  const clonePayload = (): TransferPayload => payload.map((c) => ({ ...c }));

  // THREAT-02 / D-08 — create() must issue a native EX write carrying the
  // configured ttlSeconds, so the backend (not the adapter) evicts the handle.
  it("kv: create() issues a set carrying { ex } equal to ttlSeconds", async () => {
    let clock = 0;
    const { client, sets } = createRecordingFake(() => clock);
    const ttlSeconds = 45;
    const store = createKVTransferStore({ ttlSeconds, now: () => clock, redis: client });

    const { code } = await store.create(clonePayload());

    expect(sets).toHaveLength(1);
    expect(sets[0]?.ex).toBe(ttlSeconds);
    expect(sets[0]?.key).toBe(code);
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });

  // THREAT-02 / D-09 — consume() must route through atomic getdel (one-time-use
  // is server-side, no get-then-delete window).
  it("kv: consume() routes through atomic getdel; second consume is null", async () => {
    let clock = 0;
    const { client, getdelCalls } = createRecordingFake(() => clock);
    const store = createKVTransferStore({ now: () => clock, redis: client });

    const { code } = await store.create(clonePayload());
    const first = await store.consume(code);
    const second = await store.consume(code);

    expect(first).toEqual(payload);
    expect(second).toBeNull();
    expect(getdelCalls).toEqual([code, code]);
  });

  // T-01-10 / resolved Open Question 1 — round-trip type fidelity. A payload set
  // then consumed comes back DEEPLY equal and correctly typed, proving the SDK
  // auto-(de)serialization path is used directly (no double-encoding via a manual
  // JSON wrapper, which would corrupt the shape).
  it("kv: round-trips the payload deeply equal and typed (no double-encoding)", async () => {
    let clock = 0;
    const store = createKVTransferStore({
      now: () => clock,
      redis: createFakeUpstashRedis(() => clock),
    });

    const original: TransferPayload = [
      { name: "__Secure-authjs.session-token.0", value: "a.b.c-cookie_VALUE/123" },
      { name: "__Secure-authjs.session-token.1", value: "d.e.f-cookie_VALUE/456" },
    ];
    const { code } = await store.create(original.map((c) => ({ ...c })));
    const got = await store.consume(code);

    // Typed (TransferPayload | null) and structurally identical — not a string,
    // not a wrapped/encoded shape. Guard indexed access (noUncheckedIndexedAccess).
    expect(got).toEqual(original);
    expect(got).not.toBeNull();
    expect(typeof got?.[0]?.value).toBe("string");
    expect(Object.keys(got?.[0] ?? {})).toEqual(["name", "value"]);
  });

  // D-07 — TTL guard is enforced by THIS adapter at construction (the shared
  // suite asserts it too via makeStore; this pins it to the KV factory directly).
  it("kv: constructing with ttlSeconds 61 throws", () => {
    let clock = 0;
    expect(
      () =>
        createKVTransferStore({
          ttlSeconds: 61,
          redis: createFakeUpstashRedis(() => clock),
        }),
    ).toThrow();
  });
});
