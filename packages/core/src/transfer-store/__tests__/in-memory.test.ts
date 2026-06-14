// next-auth-bridge — tests for the in-memory TransferStore adapter (STORE-02).
//
// This file proves the in-memory adapter against the shared, adapter-agnostic
// contract suite (D-15) AND adds in-memory-specific assertions the shared suite
// does not cover: zero external dependencies (STORE-02), and an explicit
// delete-on-read assertion at the adapter tier (reinforcing STORE-05).
//
// Security tests are commented THREAT-02 for Phase 4 threat-model traceability.
// Expiry is driven by an injected clock (D-14) — no setTimeout, no real waits,
// no vi.useFakeTimers. Concurrency is structural, not timing-based (Pitfall 1).
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import type { TransferStoreOptions } from "../types.js";
import { runTransferStoreContract } from "./contract.js";
import { createInMemoryTransferStore } from "../in-memory.js";

/**
 * Factory the contract suite consumes: build an in-memory adapter from the
 * shared options. Driving the in-memory store DIRECTLY (no network, no KV) is
 * the whole point of STORE-02 — the deterministic test-bench backend.
 */
const makeStore = (opts: TransferStoreOptions) =>
  createInMemoryTransferStore(opts);

// D-15: run the ENTIRE shared contract against the in-memory adapter. This
// covers STORE-01 (no mode field), STORE-04 (256-bit entropy), STORE-05
// (one-time-use + concurrency), STORE-06 (expiry + ttl-guard), and the
// miss-returns-null oracle (D-03) without re-stating any of those cases here.
runTransferStoreContract(makeStore);

describe("createInMemoryTransferStore (in-memory adapter specifics, STORE-02)", () => {
  // D-01 — chunk-array payload. Cloned per-create via payload.map (NOT object
  // spread, which corrupts an array into { "0": …, "1": … }).
  const payload = [
    { name: "__Secure-authjs.session-token.0", value: "chunk-zero-value" },
    { name: "__Secure-authjs.session-token.1", value: "chunk-one-value" },
  ] as const;
  const clonePayload = () => payload.map((c) => ({ ...c }));

  // STORE-02 — zero external dependencies. The adapter is constructable and
  // fully exercised (create + consume round-trip) with no network, no KV
  // client, no env vars: this is the non-negotiable Vitest test-bench backend.
  it("in-memory: runs with zero external dependencies (no KV, no network)", async () => {
    const store = createInMemoryTransferStore();
    const { code } = await store.create(clonePayload());
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    expect(await store.consume(code)).toEqual(payload);
  });

  // STORE-05 / THREAT-02 — explicit delete-on-read at the in-memory tier. After
  // a successful consume the entry is gone, so a direct second consume returns
  // null. Reinforces one-time-use specifically for the in-memory adapter.
  it("in-memory: delete-on-read — a second consume after success returns null", async () => {
    const store = createInMemoryTransferStore();
    const { code } = await store.create(clonePayload());
    expect(await store.consume(code)).toEqual(payload);
    expect(await store.consume(code)).toBeNull();
  });

  // STORE-06 / D-07 — construction-time TTL guard is a loud throw, not a clamp.
  it("in-memory: constructing with ttlSeconds > 60 throws (no silent clamp)", () => {
    expect(() => createInMemoryTransferStore({ ttlSeconds: 61 })).toThrow();
    expect(() => createInMemoryTransferStore({ ttlSeconds: 60 })).not.toThrow();
  });

  // STORE-06 / THREAT-02 — lazy expiry against the injected clock (D-14). No
  // real wait: advance a mutable `now` closure past create-time + TTL.
  it("in-memory: lazy expiry via the injected clock returns null past the TTL", async () => {
    let clock = 1_000_000;
    const store = createInMemoryTransferStore({ ttlSeconds: 60, now: () => clock });
    const { code } = await store.create(clonePayload());
    clock += 60 * 1000 + 1; // just past the TTL boundary
    expect(await store.consume(code)).toBeNull();
  });
});
