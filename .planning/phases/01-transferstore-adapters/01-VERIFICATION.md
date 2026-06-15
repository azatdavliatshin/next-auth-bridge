---
phase: 01-transferstore-adapters
verified: 2026-06-05T13:32:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 1: TransferStore & Adapters Verification Report

**Phase Goal:** A mode-agnostic handle store exists with two working backends — one for the test bench, one for Vercel serverless — and its security invariants are proven directly against the store.
**Verified:** 2026-06-05T13:32:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `TransferStore` interface exposes `create(payload)`, `consume(code)`, TTL semantics, no popup/PWA-specific fields on stored entries (mode-agnostic, survives to v0.2) | ✓ VERIFIED | `types.ts:50-67` defines `create()`/`consume()`; `TransferPayload` (`types.ts:23-26`) is single-field `authCookieValue` only. Contract test "no mode field" passes for both adapters (2 passed) — asserts `Object.keys` == `["authCookieValue"]` and rejects `/mode|popup|pwa|native|transport/i`. Re-exported from `index.ts:11-15`. |
| 2 | In-memory adapter satisfies interface, usable by Vitest, zero external deps; Vercel KV adapter satisfies same interface for cross-invocation state | ✓ VERIFIED | `in-memory.ts:53` `class InMemoryTransferStore implements TransferStore`; runtime spot-check: `dist/index.js` exports only `InMemoryTransferStore`, roundtrip works with no deps. `kv.ts:78` `class KVTransferStore implements TransferStore` on `@upstash/redis`; resolves via `dist/store/kv.js`. Both driven by ONE shared `runTransferStoreContract` (`contract.ts:36`). 26/26 tests pass. |
| 3 | Generated codes are 256-bit CSPRNG hex (entropy test passes against store directly) | ✓ VERIFIED | `generate-code.ts:22` `randomBytes(32).toString("hex")` — sole entropy site. `grep randomBytes` outside generate-code.ts → none in source. No `Math.random`. `-t "256-bit"` → 3 passed (generate-code + contract x2). Uniqueness across 10,000 generations passes. |
| 4 | Second `consume` of any code fails because code deleted on first read (one-time-use negative test passes) | ✓ VERIFIED | `in-memory.ts:97-109` delete-first-then-validate (synchronous before await); `kv.ts:115` atomic `getdel`. `-t "one-time-use"` → 4 passed (2 per adapter incl. concurrency "exactly one wins"). Runtime: in-memory + KV replay both return `null`. |
| 5 | Code older than TTL (≤60s) fails `consume` (expiry negative test passes) | ✓ VERIFIED | In-memory lazy expiry vs injected clock (`in-memory.ts:105`); KV native `set({ex})` (`kv.ts:104`). `-t "expiry"` → 7 passed (boundary above/below + ttl-guard, both adapters). Runtime: clock advanced past 60s → `null` for both. `ttlSeconds:61` throws at construction (InMemory Error, KV RangeError). |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/transfer-store/types.ts` | Locked `TransferStore` + mode-agnostic `TransferPayload` | ✓ VERIFIED | Interface + options + payload; re-exported from `index.ts`. |
| `src/transfer-store/generate-code.ts` | Single 256-bit CSPRNG site | ✓ VERIFIED | `randomBytes(32)`; only entropy site in package. |
| `src/transfer-store/in-memory.ts` | `InMemoryTransferStore` (STORE-02) | ✓ VERIFIED | Implements interface, zero deps, calls `generateCode`. |
| `src/transfer-store/kv.ts` | `KVTransferStore` at `./store/kv` (STORE-03) | ✓ VERIFIED | Implements interface on `@upstash/redis`; native `set({ex})` + `getdel`; subpath-only. |
| `src/transfer-store/__tests__/contract.ts` | Shared suite (D-15) | ✓ VERIFIED | One `runTransferStoreContract`, imported by both adapter tests. |
| `src/transfer-store/__tests__/fake-upstash-redis.ts` | Clock-aware fake | ✓ VERIFIED | Models `set({ex})` + `getdel` against injected clock. |
| `package.json` exports | main + `./store/kv` subpath | ✓ VERIFIED | Build emits `dist/store/kv.js` + `dist/store/kv.d.ts`. |
| `tsconfig.json` | `strict: true` | ✓ VERIFIED | `tsconfig.json:8`; `tsc --noEmit` exits 0. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `index.ts` | `types.ts` | re-export | ✓ WIRED | `export type { TransferStore, TransferPayload, ... }`. |
| `index.ts` | `in-memory.ts` | re-export | ✓ WIRED | `export { InMemoryTransferStore }`. |
| `index.ts` | `kv.ts` | (must NOT exist) | ✓ ISOLATED | No KV import; `dist/index.js` has 0 upstash refs; `dist/store/kv.js` has it (D-11). |
| `in-memory.ts` / `kv.ts` | `generate-code.ts` | `generateCode()` | ✓ WIRED | Both call `generateCode()`; neither calls `randomBytes` directly. |
| both adapter tests | `contract.ts` | `runTransferStoreContract` | ✓ WIRED | Single suite drives both — no duplicated/divergent suites. |
| `kv.test.ts` | `fake-upstash-redis.ts` | `createFakeUpstashRedis` | ✓ WIRED | Same injected clock passed to fake. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Strict typecheck | `pnpm exec tsc --noEmit` | exit 0 | ✓ PASS |
| Full suite | `pnpm test` | 3 files / 26 tests passed | ✓ PASS |
| Build subpath emit | `pnpm build` | `dist/store/kv.js` + `dist/store/kv.d.ts` emitted | ✓ PASS |
| Subpath import | `import { KVTransferStore } from './dist/store/kv.js'` | `function` | ✓ PASS |
| Main entry isolation | `import * as m from './dist/index.js'` | keys=`InMemoryTransferStore`; `hasKV:false` | ✓ PASS |
| In-memory one-time-use | runtime roundtrip | first=payload, second=null | ✓ PASS |
| KV native EX + getdel + expiry | runtime via injected fake | ex=60000ms, replay=null, expired=null | ✓ PASS |
| ttlSeconds 61 throws | runtime both adapters | InMemory `Error`, KV `RangeError` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| STORE-01 | 01-01 | Mode-agnostic `TransferStore` interface, no popup/PWA fields | ✓ SATISFIED | `types.ts`; "no mode field" test (2 passed). |
| STORE-02 | 01-02 | In-memory adapter, test bench, zero deps | ✓ SATISFIED | `in-memory.ts`; "zero external dependencies" test. |
| STORE-03 | 01-03 | Vercel KV adapter, cross-invocation, subpath | ✓ SATISFIED | `kv.ts`; subpath build + isolation verified. |
| STORE-04 | 01-01 | 256-bit CSPRNG hex codes | ✓ SATISFIED | `generate-code.ts`; `-t "256-bit"` (3 passed). |
| STORE-05 | 01-02, 01-03 | One-time-use, deleted on first read | ✓ SATISFIED | delete-first / `getdel`; `-t "one-time-use"` (4 passed). |
| STORE-06 | 01-02, 01-03 | TTL ≤ 60s expiry; ttl>60 rejected | ✓ SATISFIED | `-t "expiry"` (7 passed); ttl 61 throws both adapters. |

No orphaned requirements — all 6 STORE IDs claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in source. No `any` in source or tests. `return null` cases are interface-mandated miss-handling (D-03), not stubs. |

### Human Verification Required

None for Phase 1. The only manual-only item (real-Upstash live roundtrip, STORE-03) is explicitly deferred to the Phase 5 Vercel preview per PROJECT.md constraint and 01-VALIDATION.md — not a Phase 1 deliverable. The contract suite proves KV semantics against the clock-aware fake, which is the Phase 1 contract.

### Gaps Summary

No gaps. The phase goal is achieved in the codebase: a mode-agnostic `TransferStore` interface with two working adapters (in-memory + KV), entropy from a single 256-bit CSPRNG site, one-time-use and TTL≤60s invariants proven directly against both stores through one shared contract suite. All commands run independently of SUMMARY claims: `tsc --noEmit` clean, 26/26 tests pass, build emits the `./store/kv` subpath, KV is isolated from the main entry, and behavioral spot-checks against the built artifacts confirm every security invariant.

---

_Verified: 2026-06-05T13:32:00Z_
_Verifier: Claude (gsd-verifier)_
