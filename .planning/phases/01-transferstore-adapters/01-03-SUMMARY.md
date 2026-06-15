---
phase: 01-transferstore-adapters
plan: 03
subsystem: transfer-store
tags: [typescript, vitest, upstash-redis, kv, getdel, ttl, subpath-export, serverless]

# Dependency graph
requires:
  - "01-01: TransferStore/TransferPayload/TransferStoreOptions in types.ts"
  - "01-01: generateCode() single CSPRNG site"
  - "01-01: runTransferStoreContract(makeStore) shared suite (D-15)"
  - "01-01: createFakeUpstashRedis(now) clock-aware fake"
  - "01-01: ./store/kv exports-map key + store/kv tsup entry reserved"
provides:
  - "KVTransferStore — production Vercel KV adapter on @upstash/redis at the ./store/kv subpath (STORE-03)"
  - "KVRedisClient — minimal structural client shape (set({ex}) + getdel<T>) the adapter depends on (no any)"
  - "KVTransferStoreOptions — TransferStoreOptions extended with an injectable redis client"
  - "kv.test.ts — drives the shared contract suite against KV-via-fake + KV-specific EX/getdel/round-trip assertions"
  - "Confirmed env fallbacks Redis.fromEnv() reads (for Phase 5 Vercel wiring)"
affects: [Phase 2 bridge/consume routes, Phase 5 Vercel preview real-KV roundtrip]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injectable backend client typed by a minimal structural surface (KVRedisClient) — fake satisfies it with no any (D-15)"
    - "Native EX TTL (set({ex}), D-08) + atomic getdel (D-09) — expiry/one-time-use are server-side, no adapter-local bookkeeping"
    - "SDK-owned (de)serialization (D-05): typed payload passed straight through, no manual encode/decode (resolved Open Question 1)"
    - "Subpath-only adapter (D-11): KVTransferStore is NOT re-exported from src/index.ts so the main entry never imports @upstash/redis"

key-files:
  created:
    - packages/core/src/transfer-store/kv.ts
    - packages/core/src/transfer-store/__tests__/kv.test.ts
  modified: []

key-decisions:
  - "Injected client typed by a new exported KVRedisClient structural interface (set(key,value,{ex}):Promise<unknown>; getdel<T>(key):Promise<T|null>) so FakeUpstashRedis conforms without any; the real Redis client is cast to it via `as unknown as KVRedisClient` only at the Redis.fromEnv() default site"
  - "ttlSeconds > 60 throws RangeError at construction (D-07 / resolved Open Question 2); default ttlSeconds = 60"
  - "now seam accepted for a uniform constructor but unused by the adapter itself — expiry is owned by backend EX; the contract suite injects the same clock into the fake (Pitfall 2)"
  - "KV-specific test uses a recording wrapper around createFakeUpstashRedis to assert set carried { ex } == ttlSeconds and that consume routes through getdel, while delegating to the same clock-aware fake"

patterns-established:
  - "MIT SPDX header on both new .ts files (CLAUDE.md)"
  - "Security tests comment THREAT-02 / T-01-* for Phase 4 threat-model traceability"

requirements-completed: [STORE-03, STORE-05, STORE-06]

# Metrics
duration: 5 min
completed: 2026-06-05
---

# Phase 1 Plan 03: KV TransferStore Adapter Summary

**`KVTransferStore` — the production Vercel-KV adapter on `@upstash/redis@1.38.0` at the `next-auth-bridge/store/kv` subpath — implementing `TransferStore` with native `set({ ex })` TTL (D-08) and atomic `getdel` (D-09), proven against the shared D-15 contract suite using the clock-aware FakeUpstashRedis (no real KV), with the subpath build emitting its JS + types.**

## Performance
- **Duration:** ~5 min
- **Started:** 2026-06-05T09:20Z
- **Completed:** 2026-06-05T09:25Z
- **Tasks:** 2
- **Files created:** 2 (kv.ts, kv.test.ts); 0 modified

## Accomplishments
- Authored `KVTransferStore implements TransferStore` on the non-deprecated `@upstash/redis` client (D-10), isolated behind the `./store/kv` subpath (D-11) — NOT re-exported from `src/index.ts`, so the main entry never imports `@upstash/redis`.
- `create()` calls the single-site `generateCode()` and `redis.set(code, payload, { ex: ttlSeconds })` — native EX TTL (D-08), payload passed straight through with no manual encoding (SDK auto-serializes, D-05 / resolved Open Question 1).
- `consume()` returns `redis.getdel<TransferPayload>(code)` — atomic read+delete (D-09), one-time-use enforced server-side; `null` reserved for the miss path, operational errors propagate (D-13).
- Construction-time TTL guard: `ttlSeconds > 60` throws `RangeError` (D-07 / resolved Open Question 2); default 60.
- Injectable client typed by a new structural `KVRedisClient` surface so FakeUpstashRedis conforms with no `any`; defaults to `Redis.fromEnv()` when none injected.
- `kv.test.ts` drives the shared `runTransferStoreContract` against KV-via-fake (STORE-01/04/05/06 green) using the SAME injected clock the suite advances (Pitfall 2), plus KV-specific assertions for EX TTL, atomic getdel, and round-trip type fidelity.
- Verified the `./store/kv` subpath builds end-to-end: `pnpm build` (tsup) emits `dist/store/kv.js` + `dist/store/kv.d.ts`.

## Task Commits
1. **Task 1: Implement KVTransferStore** — `8732266` (feat)
2. **Task 2: Contract suite against KV-via-fake + subpath build** — `8526ac4` (test)

**Plan metadata:** committed after this SUMMARY (docs).

## Verification Results
- `pnpm exec tsc --noEmit` — exit 0 (strict, no `any` in source).
- Task 1 structural guards — `class KVTransferStore` present; uses `getdel` + `ex`; no entropy re-impl; no manual JSON encode; not in `src/index.ts`. PASS.
- `pnpm exec vitest run src/transfer-store/__tests__/kv.test.ts` — 12 passed (8 shared contract + 4 KV-specific).
- `pnpm exec vitest run -t "one-time-use"` — 2 passed (KV adapter). `-t "expiry"` — 3 passed (KV adapter). Run as separate invocations (see Deviations).
- `pnpm build` — emits `dist/store/kv.js` (912 B) + `dist/store/kv.d.ts` (1.99 KB). Subpath resolves end-to-end.
- Full suite `pnpm test` — 14 passed (2 files), nothing broken.

## Env Var Fallbacks (for Phase 5 wiring)
When no client is injected, `KVTransferStore` defaults to `Redis.fromEnv()`, which reads:
- URL: `UPSTASH_REDIS_REST_URL` || `KV_REST_API_URL`
- Token: `UPSTASH_REDIS_REST_TOKEN` || `KV_REST_API_TOKEN`

Phase 5 must provision these in the Vercel preview env for the real-KV roundtrip. (Vitest never touches real KV — the fake covers Phase 1.)

## KV-Specific Test Titles
Inside `describe("KVTransferStore (kv adapter — @upstash/redis specifics)")` — at least one title contains "kv" so the VALIDATION map's `pnpm test kv` selects the file:
- `kv: create() issues a set carrying { ex } equal to ttlSeconds` (D-08)
- `kv: consume() routes through atomic getdel; second consume is null` (D-09)
- `kv: round-trips the payload deeply equal and typed (no double-encoding)` (resolved Open Question 1 / T-01-10)
- `kv: constructing with ttlSeconds 61 throws` (D-07)

The shared contract suite contributes its 8 `it`s under `describe("TransferStore contract (D-15 / THREAT-02)")` (titles per 01-01-SUMMARY).

## Decisions Made
- **`KVRedisClient` structural interface** rather than depending on the full `Redis` type for the seam. This lets the fake conform without `any`; the real `Redis` is cast `as unknown as KVRedisClient` ONLY at the `Redis.fromEnv()` default site (a single, auditable boundary).
- **Recording-wrapper fake** for the KV-specific `{ ex }`/`getdel` assertions: wraps `createFakeUpstashRedis` and captures `set`/`getdel` args while delegating, so the assertions use the SAME clock-aware semantics the contract suite relies on (no parallel fake implementation to drift).
- **`now` accepted but unused by the adapter** — expiry is the backend's job via EX. Documented in code so a future reader doesn't add redundant clock bookkeeping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan verify comments tripped the literal source-scan guards**
- **Found during:** Task 1
- **Issue:** The Task 1 `<automated>` guard greps the raw file for `randomBytes` and `JSON.(stringify|parse)` to assert the adapter does not re-implement entropy or double-encode. My explanatory comments literally contained the words "no randomBytes here", "no JSON.stringify", and "no JSON.parse", so the substring scan failed even though the code is correct.
- **Fix:** Rephrased the three comments to convey the same intent without the literal tokens (e.g. "call the crypto primitive itself", "no manual string encoding", "no manual decode"). No behavior change.
- **Files modified:** packages/core/src/transfer-store/kv.ts
- **Verification:** Task 1 `<automated>` guard now prints `kv adapter ok`; `tsc --noEmit` exit 0.
- **Committed in:** 8732266

**2. [Rule 3 - Blocking] Plan verify uses stacked `-t` flags vitest 4.1.8 rejects**
- **Found during:** Task 2
- **Issue:** The plan's `<automated>` runs `pnpm exec vitest run -t "one-time-use" -t "expiry"`. Vitest 4.1.8's `--testNamePattern` accepts only ONE value; two `-t` flags error with `Expected a single value for option "-t"`. This is a CLI-shape issue in the verify command, not the implementation.
- **Fix:** Ran the two filters as the intended SEPARATE invocations (`-t "one-time-use"` then `-t "expiry"`), which is how 01-01-SUMMARY documents them. Both pass for the KV adapter against the fake.
- **Files modified:** none (verification-command correction only)
- **Verification:** `-t "one-time-use"` → 2 passed; `-t "expiry"` → 3 passed (KV adapter, fake-backed).
- **Committed in:** n/a (no code change)

**3. [Rule 3 - Blocking] Worktree branched from stale base (ba0c11f), missing all 01-01 artifacts (#2015)**
- **Found during:** Setup (before Task 1)
- **Issue:** The isolated worktree's per-agent branch `worktree-agent-acd4bcded22fddced` was created from `ba0c11f` (initial project setup) instead of the `dev` tip (`b52d185`), so `packages/core` and every 01-01 foundation file were absent — the known `EnterWorktree` base-selection bug (#2015). My branch had zero unique commits ahead of `dev`.
- **Fix:** Asserted HEAD is on the per-agent branch (not a protected ref), then `git reset --hard b52d185` (dev tip) to bring in 01-01's committed foundation. Ran `pnpm install` to populate the worktree's node_modules (`@upstash/redis@1.38.0` resolved). No 01-01 history was rewritten — my branch was strictly behind dev.
- **Files modified:** none (git-base reconciliation only)
- **Verification:** `git log` shows `b52d185 docs(01-01)…`, `1e677c8 test(01-01)…` etc.; `packages/core/src/transfer-store/{types.ts,generate-code.ts,__tests__/}` present; `@upstash/redis` resolvable from `packages/core`.
- **Committed in:** n/a (no code change; pre-work base fix)

---

**Total deviations:** 3 auto-fixed (2 verify-command/comment-scan boundary fixes, 1 worktree-base reconciliation). All Rule 3 (blocking) — none changed plan scope or the implemented design.
**Impact on plan:** None. All locked decisions (D-08/D-09/D-11/D-07/D-05/D-13) implemented as written; the contract suite passes against KV-via-fake and the subpath builds.

## Issues Encountered
None beyond the deviations above. All task verifications and plan-level verification pass.

## Known Stubs
None. The adapter is fully wired: real serialization via the SDK, real EX/getdel semantics modeled by the clock-aware fake, real subpath build emitting JS + types. The real-KV REST roundtrip is intentionally deferred to the Phase 5 Vercel preview per the PROJECT.md constraint (not a stub — by design).

## Next Phase Readiness
- Wave 2 KV adapter complete. `next-auth-bridge/store/kv` now resolves to a working KV adapter; the main entry stays free of `@upstash/redis` (D-11 isolation intact).
- Phase 2 (bridge/consume routes) can construct `createKVTransferStore()` (env-defaulted) or inject a `Redis` for cross-invocation transfer state (STORE-03).

> **API update (post-execution):** the class adapters were converted to functional factories — `KVTransferStore` is now `createKVTransferStore(opts): TransferStore` (no `class`/`new`). `KVTransferStoreOptions` and `KVRedisClient` interfaces are unchanged. See CLAUDE.md "Functional style — no classes". Behavior, the `./store/kv` subpath export, and tests are unchanged; only the construction call site changed (`createKVTransferStore(opts)` instead of `new KVTransferStore(opts)`).
- Phase 5 must set `UPSTASH_REDIS_REST_URL`/`KV_REST_API_URL` + `UPSTASH_REDIS_REST_TOKEN`/`KV_REST_API_TOKEN` in the Vercel preview to exercise the real-KV roundtrip.

## Self-Check: PASSED
- `packages/core/src/transfer-store/kv.ts` — present on disk.
- `packages/core/src/transfer-store/__tests__/kv.test.ts` — present on disk.
- Commits `8732266` (feat) and `8526ac4` (test) — verified in `git log`.
- Plan-level verification re-run: `tsc --noEmit` exit 0; kv.test.ts 12 passed; `-t "one-time-use"`/`-t "expiry"` pass for KV; `pnpm build` emits `dist/store/kv.js` + `dist/store/kv.d.ts`; `KVTransferStore` absent from `src/index.ts`.

---
*Phase: 01-transferstore-adapters*
*Completed: 2026-06-05*
