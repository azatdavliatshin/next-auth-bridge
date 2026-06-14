// next-auth-bridge — the shared, adapter-agnostic TransferStore contract suite.
//
// D-15: ONE suite proves both adapters satisfy identical security semantics.
// Plans 02 (in-memory) and 03 (KV-against-fake) each call
// runTransferStoreContract(makeStore) with a factory; the in-memory adapter is
// driven directly, the KV adapter against the clock-aware FakeUpstashRedis.
//
// THREAT-02 invariants asserted here (referenced for Phase 4's threat-model
// mapping): entropy (STORE-04), one-time-use / atomic delete-first (STORE-05),
// TTL ≤ 60s expiry (STORE-06), and the mode-agnostic stored shape (STORE-01).
// No real waits, no global timer mocks: expiry is driven by an injected clock
// (D-14). Concurrency is structural, not timing-based (RESEARCH Pitfall 1).
//
// This module is a reusable suite function, NOT a standalone test file — it has
// no adapter to construct yet, so it is invoked by Plans 02/03, not run here.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, expect, it } from "vitest";

import type { TransferStore, TransferStoreOptions } from "../types.js";

/**
 * A factory that constructs a TransferStore under test from shared options
 * (the injectable clock + TTL). Both adapters expose this constructor shape.
 */
export type MakeStore = (opts: TransferStoreOptions) => TransferStore;

/**
 * The adapter-agnostic TransferStore contract. Call inside a `describe` (or at
 * the top level) of an adapter's test file with a factory for that adapter.
 */
export function runTransferStoreContract(makeStore: MakeStore): void {
  describe("TransferStore contract (D-15 / THREAT-02)", () => {
    // D-01 — payload is a chunk array of {name,value} entries (a `.0` + `.1`
    // session-token chunk pair). Cloned per-create via payload.map (NOT object
    // spread, which would corrupt an array into { "0": …, "1": … }).
    const payload = [
      { name: "__Secure-authjs.session-token.0", value: "chunk-zero-value" },
      { name: "__Secure-authjs.session-token.1", value: "chunk-one-value" },
    ] as const;
    const clonePayload = () => payload.map((c) => ({ ...c }));

    // STORE-04 / THREAT-02 — entropy. The store mints a 256-bit code; the
    // caller never supplies entropy, so weak codes are impossible by
    // construction (D-01).
    it("create() returns a 256-bit (64 lowercase-hex-char) code", async () => {
      const store = makeStore({});
      const { code } = await store.create(clonePayload());
      expect(code).toMatch(/^[0-9a-f]{64}$/);
    });

    // STORE-01 / D-06 — the round-tripped value equals the input and the
    // stored shape carries NO mode-discriminating field. A future transport
    // discriminator would fail this test and be visible in review.
    it("round-trips the payload with no mode field on the stored shape", async () => {
      const store = makeStore({});
      const { code } = await store.create(clonePayload());
      const got = await store.consume(code);
      expect(got).toEqual(payload);
      // Mode-agnostic invariant (D-01 array shape): every harvested entry has
      // EXACTLY the keys name+value — nothing that discriminates popup vs PWA
      // vs any transport. A future transport discriminator key on an entry would
      // fail this and be visible in review.
      for (const entry of got ?? []) {
        expect(Object.keys(entry)).toEqual(["name", "value"]);
        for (const key of Object.keys(entry)) {
          expect(key).not.toMatch(/mode|popup|pwa|native|transport/i);
        }
      }
    });

    // STORE-05 / THREAT-02 — one-time-use. A second consume of the same code
    // returns null (handle is gone after exactly one consume, D-09).
    it("one-time-use: second consume of the same code returns null", async () => {
      const store = makeStore({});
      const { code } = await store.create(clonePayload());
      const first = await store.consume(code);
      expect(first).toEqual(payload);
      const second = await store.consume(code);
      expect(second).toBeNull();
    });

    // STORE-05 / THREAT-02 — concurrent consume. Structural, deterministic
    // (Pitfall 1): exactly one of two concurrent consumes wins, the other gets
    // null. No artificial delays, no probabilistic race.
    it("one-time-use under concurrency: exactly one of two consumes wins", async () => {
      const store = makeStore({});
      const { code } = await store.create(clonePayload());
      const results = await Promise.all([store.consume(code), store.consume(code)]);
      const nonNull = results.filter((r) => r !== null);
      const nulls = results.filter((r) => r === null);
      expect(nonNull).toHaveLength(1);
      expect(nulls).toHaveLength(1);
      expect(nonNull[0]).toEqual(payload);
    });

    // STORE-06 / THREAT-02 — expiry via the injected clock (D-14). Advance the
    // clock past the TTL; consume returns null. No real wait.
    it("expiry: consume after the clock advances past the TTL returns null", async () => {
      let clock = 0;
      const now = () => clock;
      const ttlSeconds = 60;
      const store = makeStore({ ttlSeconds, now });
      const { code } = await store.create(clonePayload());
      clock += ttlSeconds * 1000 + 1; // just past the TTL boundary
      expect(await store.consume(code)).toBeNull();
    });

    // STORE-06 — a code consumed just before the TTL boundary still resolves
    // (the clock seam is exercised in both directions).
    it("expiry: consume just before the TTL boundary still returns the payload", async () => {
      let clock = 0;
      const now = () => clock;
      const ttlSeconds = 60;
      const store = makeStore({ ttlSeconds, now });
      const { code } = await store.create(clonePayload());
      clock += ttlSeconds * 1000 - 1; // still within the TTL window
      expect(await store.consume(code)).toEqual(payload);
    });

    // STORE-06 / D-07 — TTL guard. Constructing with ttlSeconds > 60 throws at
    // construction (resolved Open Question 2): a loud misconfiguration, not a
    // silent clamp that could mask a security-relevant config mistake.
    it("expiry guard: constructing with ttlSeconds 61 throws", () => {
      expect(() => makeStore({ ttlSeconds: 61 })).toThrow();
    });

    // D-03 — miss modes collapse to null. Consume of a never-created code
    // returns null identically to a second consume (no oracle, no timing
    // signal distinguishing miss modes).
    it("consume of an unknown (never-created) code returns null", async () => {
      const store = makeStore({});
      const unknownCode = "0".repeat(64);
      expect(await store.consume(unknownCode)).toBeNull();
    });
  });
}
