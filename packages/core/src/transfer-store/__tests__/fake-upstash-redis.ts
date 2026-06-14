// next-auth-bridge — clock-aware in-memory fake of the @upstash/redis client.
//
// The KV adapter (Plan 03) relies on native `EX` eviction and atomic `getdel`.
// To keep ONE shared contract suite (D-15) adapter-agnostic, this fake models
// `set(k, v, { ex })` and `getdel` against the SAME injected clock the suite
// advances (D-14 / RESEARCH Pitfall 2) — not real wall-clock time. The real
// Upstash REST roundtrip is exercised in the Phase 5 Vercel preview, never in
// Vitest (PROJECT.md constraint).
//
// It implements ONLY the surface the KV adapter uses: set, get, getdel. The
// fake stores the value object DIRECTLY (no JSON.stringify) to match the SDK's
// effective auto-(de)serialization behavior (resolved Open Question 1) — the
// adapter passes the typed payload straight through, so the fake must too.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

interface FakeEntry {
  value: unknown;
  /** Absolute expiry in injected-clock milliseconds, or null for no TTL. */
  expireAt: number | null;
}

export interface FakeUpstashRedis {
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<"OK">;
  get<T>(key: string): Promise<T | null>;
  getdel<T>(key: string): Promise<T | null>;
}

/**
 * Create a clock-aware in-memory fake of the Upstash Redis client.
 *
 * @param now A monotonic-ish clock returning milliseconds (the same closure the
 *   contract suite advances). `set({ ex })` records `expireAt = now() + ex*1000`;
 *   reads treat an entry as missing once `now() >= expireAt`.
 */
export function createFakeUpstashRedis(now: () => number): FakeUpstashRedis {
  const store = new Map<string, FakeEntry>();

  // Return the live entry, or undefined if absent or expired (evicting the
  // expired entry, mirroring native EX eviction against the injected clock).
  const live = (key: string): FakeEntry | undefined => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expireAt !== null && now() >= entry.expireAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };

  return {
    async set(key, value, opts) {
      const ex = opts?.ex;
      store.set(key, {
        value,
        expireAt: ex != null ? now() + ex * 1000 : null,
      });
      return "OK";
    },

    async get<T>(key: string): Promise<T | null> {
      const entry = live(key);
      return entry ? (entry.value as T) : null;
    },

    // Atomic read-and-delete: synchronously remove and return the prior value
    // (or null if absent/expired). No await yields between read and delete, so
    // two concurrent getdels can never both observe the entry.
    async getdel<T>(key: string): Promise<T | null> {
      const entry = live(key);
      if (!entry) return null;
      store.delete(key);
      return entry.value as T;
    },
  };
}
