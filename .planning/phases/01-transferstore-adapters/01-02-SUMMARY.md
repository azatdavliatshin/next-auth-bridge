---
phase: 01-transferstore-adapters
plan: 02
subsystem: transfer-store
tags: [typescript, vitest, in-memory-adapter, transfer-store, csprng, ttl, one-time-use]

# Dependency graph
requires:
  - "01-01: TransferStore interface + TransferPayload + TransferStoreOptions (../types.js)"
  - "01-01: generateCode() single entropy site (./generate-code.js)"
  - "01-01: runTransferStoreContract(makeStore) shared contract suite (./__tests__/contract.js)"
provides:
  - "InMemoryTransferStore — dependency-free TransferStore adapter (STORE-02), reference impl of the store invariants"
  - "InMemoryTransferStore re-exported from the package main entry (D-11)"
  - "in-memory.test.ts — runs the shared contract suite (D-15) against the in-memory adapter + in-memory-specific cases"
affects: [01-03 KV adapter (same contract suite, parallel), Phase 2 bridge/consume routes (consume the store)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic delete-FIRST then validate on consume (D-09 / Pitfall 1): read+Map.delete run synchronously before any await yields → concurrent consumes cannot both win"
    - "Lazy expiry against an injected clock (D-08 / D-14): expiresAt checked on read against this.now(); no timers, no sweeps"
    - "Construction-time TTL guard (D-07): throw on ttlSeconds > 60, no silent clamp"
    - "Single entropy site preserved (D-01): adapter calls generateCode(), no local CSPRNG"
    - "Mode-agnostic stored entry (D-06): { payload, expiresAt } — no transport discriminator"

key-files:
  created:
    - packages/core/src/transfer-store/in-memory.ts
    - packages/core/src/transfer-store/__tests__/in-memory.test.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "Task 2's test file was authored during Task 1's TDD RED phase (it is the failing test that drove the implementation); its content is exactly Task 2's deliverable, so Task 2 added no new commit — its <verify> filters pass against the already-committed file"
  - "consume() uses delete-FIRST (get → Map.delete → validate) so the only async boundary occurs after the entry is already removed — one-time-use is structural, not timing-dependent"
  - "TTL guard throws at construction with a message naming the 60s cap (resolved Open Question 2 / D-07)"

patterns-established:
  - "In-memory adapter is the reference implementation of STORE-05/06 proven with zero network in the loop"

requirements-completed: [STORE-02, STORE-05, STORE-06]

# Metrics
duration: 4 min
completed: 2026-06-05
---

# Phase 1 Plan 02: In-Memory TransferStore Adapter Summary

**`InMemoryTransferStore` — a dependency-free, single-process `TransferStore` that mints codes via the single `generateCode()` entropy site, enforces one-time-use through an atomic delete-FIRST consume, and expires codes lazily against an injectable clock with a construction-time TTL≤60s throw; proven green against the shared D-15 contract suite plus in-memory-specific cases on the Vitest bench.**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-06-05
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2: verification of the contract-driving test)
- **Files created:** 2 (`in-memory.ts`, `in-memory.test.ts`); 1 modified (`index.ts`)

## Accomplishments

- Implemented `InMemoryTransferStore implements TransferStore` with:
  - **Single entropy site (D-01):** `create()` calls `generateCode()`; the adapter contains no local CSPRNG call (`randomBytes` absent from the file).
  - **Atomic delete-FIRST consume (D-09 / Pitfall 1):** `consume()` does `get` → `Map.delete` synchronously, THEN validates. The only async boundary is after the entry is already gone, so two concurrent consumes can never both observe it — one-time-use is structural.
  - **Lazy expiry via injected clock (D-08 / D-14):** stores `expiresAt = now() + ttlSeconds*1000`; on consume, `now() >= expiresAt` → null. No timers, no `setTimeout`, no `vi.useFakeTimers`.
  - **Construction-time TTL guard (D-07):** `ttlSeconds > 60` throws an `Error` naming the 60s cap; default `ttlSeconds = 60`, `now = Date.now`.
  - **Mode-agnostic stored entry (D-06):** `Map<string, { payload, expiresAt }>` — no popup/PWA/transport discriminator.
  - **Miss = null (D-03 / D-13):** not-found / expired / already-consumed all collapse to `null`; only operational failures would throw.
- Re-exported `InMemoryTransferStore` from the package main entry `src/index.ts` (D-11).
- Authored `in-memory.test.ts` that invokes `runTransferStoreContract(makeStore)` (D-15) — running ALL shared STORE-01/04/05/06 negative cases directly against the in-memory adapter — plus four in-memory-specific assertions.

## Task Commits

1. **Task 1 (RED): failing tests for InMemoryTransferStore** — `d80a305` (test) — contract-suite invocation + in-memory-specific cases; failed because `../in-memory.js` did not exist.
2. **Task 1 (GREEN): implement InMemoryTransferStore + main-entry re-export** — `5a8141c` (feat) — adapter passes; 12/12 in-memory tests green.

Task 2 added no separate commit: its deliverable (the contract-driving test file) was the RED test from Task 1, and its `<verify>` filters all pass against that already-committed file (see Verification). No REFACTOR commit was needed — the implementation was clean on first GREEN.

**Plan metadata:** committed after this SUMMARY (docs).

## In-Memory-Specific Test Titles Added

The shared contract suite (8 `it`s from `contract.ts`) runs against the adapter via `runTransferStoreContract(makeStore)`. On top of those, `in-memory.test.ts` adds these four titles (under `describe("InMemoryTransferStore (in-memory adapter specifics, STORE-02)")`):

| `it(...)` title | Proves |
|-----------------|--------|
| `in-memory: runs with zero external dependencies (no KV, no network)` | STORE-02 — constructable + full create/consume round-trip with no network/KV/env |
| `in-memory: delete-on-read — a second consume after success returns null` | STORE-05 — explicit one-time-use at the in-memory tier |
| `in-memory: constructing with ttlSeconds > 60 throws (no silent clamp)` | STORE-06 / D-07 — loud construction-time guard |
| `in-memory: lazy expiry via the injected clock returns null past the TTL` | STORE-06 / D-08 / D-14 — clock-driven expiry, no real wait |

At least one title contains `"in-memory"`, so the VALIDATION-map command `pnpm test in-memory` selects this file (verified: 12 passed).

## Verification

All gates green (run from `packages/core`):

- `pnpm exec tsc --noEmit` → **exit 0** (strict, no `any` in source — confirmed by grep)
- `pnpm exec vitest run src/transfer-store/__tests__/in-memory.test.ts` → **12 passed** (8 contract + 4 in-memory-specific)
- `pnpm exec vitest run -t "one-time-use"` → **2 passed** (contract second-consume + concurrency; plus in-memory delete-on-read) — **STORE-05 green**
- `pnpm exec vitest run -t "expiry"` → **4 passed** (contract past-TTL, just-before-TTL, ttl-guard; plus in-memory lazy-expiry) — **STORE-06 green**
- `pnpm exec vitest run in-memory` (VALIDATION map) → **12 passed**
- Full suite `pnpm exec vitest run` → **14 passed** (2 entropy + 12 in-memory), 2 test files
- Task 1 structural verify (`grep class / generateCode / !randomBytes / index re-export`) → **ok**

**STORE-02 / STORE-05 / STORE-06 are all green on the Vitest bench with zero network in the loop.**

## Files Created/Modified

- **created** `packages/core/src/transfer-store/in-memory.ts` — `InMemoryTransferStore` class (MIT header, no `any`)
- **created** `packages/core/src/transfer-store/__tests__/in-memory.test.ts` — contract-suite invocation + in-memory-specific cases (MIT header, THREAT-02 comments)
- **modified** `packages/core/src/index.ts` — appended `export { InMemoryTransferStore }` (D-11)

## Decisions Made

- **delete-FIRST ordering** chosen so the single async boundary in `consume()` lands AFTER the entry is removed — guarantees one-time-use structurally rather than relying on timing (Pitfall 1). The contract suite's concurrency test (`exactly one of two consumes wins`) passes deterministically as a result.
- **Throw, not clamp, on `ttlSeconds > 60`** — a loud misconfiguration surfaces a security-relevant config mistake instead of silently shortening the TTL (resolved Open Question 2 / D-07).
- **Reworded two source/comment lines** that literally contained the tokens `randomBytes` / `setTimeout` (in prose describing what the code does NOT do) so the plan's substring-based verify greps are unambiguous. No behavioral change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branched from initial-setup commit, missing the 01-01 foundation**
- **Found during:** Pre-execution setup (before Task 1)
- **Issue:** The parallel worktree branch (`worktree-agent-...`) was created from `ba0c11f` (initial project setup), NOT from current `dev` HEAD where Plan 01-01 was committed. Result: `packages/core/src/transfer-store/{types,generate-code,contract}.ts` — this plan's hard dependencies — were absent from the worktree. This is the known `EnterWorktree`-branches-from-base issue the execute-plan `worktree_branch_check` exists to correct (#2015).
- **Fix:** Verified the branch HEAD (`ba0c11f`) was a clean ancestor of `dev` (`b52d185`) with no agent commits to preserve, then `git reset --hard b52d185` to bring the branch onto dev HEAD (which contains all 01-01 artifacts). HEAD remained on the per-agent branch throughout (asserted before and after).
- **Files modified:** none (git-state correction only)
- **Verification:** `ls packages/core/src/transfer-store/` shows the 01-01 files; baseline `tsc --noEmit` exit 0 and the 01-01 entropy suite (2 tests) green before any new work.
- **Committed in:** n/a (no code change; branch base correction)

**2. [Rule 3 - Blocking] Fresh worktree had no installed node_modules**
- **Found during:** Pre-execution setup (before Task 1)
- **Issue:** The fresh worktree lacked `node_modules`, so `tsc` / `vitest` were unavailable to run the task verifications.
- **Fix:** Ran `pnpm install --frozen-lockfile` at the workspace root — installs the already-locked dependencies (no new package added, no lockfile change). This is the EXCLUDED-from-Rule-3 carve-out for *new* package installs only; here it is restoring the project's existing locked deps, which is in scope.
- **Files modified:** none (`pnpm-lock.yaml` unchanged — confirmed via `git diff`)
- **Verification:** `pnpm exec tsc --noEmit` and `pnpm exec vitest run` execute successfully afterward.
- **Committed in:** n/a (no tracked-file change)

**3. [Rule 1 - verify-script false positive] Doc-comment tokens tripped substring greps**
- **Found during:** Task 1 `<verify>` (and Task 2 AC check)
- **Issue:** The Task 1 verify greps for `/randomBytes/` (to assert the adapter does not re-implement entropy) and a Task 2 AC greps for `setTimeout`/`useFakeTimers`. My documentation comments contained those literal words in prose describing what the code deliberately does NOT do, producing false-positive FAILs.
- **Fix:** Reworded the two comment lines in `in-memory.ts` (entropy note) and confirmed the `in-memory.test.ts` timer-token mentions live only in a descriptive header comment (no real call). No behavioral change to either file.
- **Files modified:** `packages/core/src/transfer-store/in-memory.ts` (comment only)
- **Verification:** Task 1 verify prints `in-memory adapter + export ok`; manual call-site grep confirms zero real `setTimeout`/`useFakeTimers` calls in the test.
- **Committed in:** `5a8141c` (the reworded comment is part of the GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 worktree/environment setup with no code change; 1 Rule 1 comment-wording fix folded into the GREEN commit).
**Impact on plan:** No scope change. All locked decisions implemented exactly as written; every task `<verify>`, every acceptance criterion, and the full plan-level `<verification>` pass.

## Issues Encountered
None blocking. The worktree base/deps setup (Deviations 1–2) was anticipated boilerplate for a fresh parallel worktree and resolved before Task 1.

## Known Stubs
None. The in-memory adapter is fully wired and exercised; no placeholder values, no unwired data paths.

## Next Phase Readiness
- **STORE-02/05/06 satisfied** and green on the Vitest bench with zero external deps.
- Wave 2 sibling **Plan 01-03 (KV adapter)** is independent: it touches only `kv.ts`/`kv.test.ts` and does NOT write `src/index.ts` (KV stays subpath-only, D-11), so there is no merge conflict with this plan's `index.ts` append. Both adapters share `runTransferStoreContract`, so the KV plan reuses the exact same contract semantics this plan just proved against an in-memory backend.
- Phase 2 bridge/consume routes can now construct the in-memory store directly from the main entry for their own tests via `createInMemoryTransferStore(opts)`.

> **API update (post-execution):** the class adapters were converted to functional factories — `InMemoryTransferStore` is now `createInMemoryTransferStore(opts): TransferStore` (no `class`/`new`). See CLAUDE.md "Functional style — no classes". Behavior, exports, and tests are unchanged; only the construction call site changed (`createInMemoryTransferStore(opts)` instead of `new InMemoryTransferStore(opts)`).

## Self-Check: PASSED
- `packages/core/src/transfer-store/in-memory.ts` — present on disk.
- `packages/core/src/transfer-store/__tests__/in-memory.test.ts` — present on disk.
- `packages/core/src/index.ts` — modified, contains `InMemoryTransferStore` re-export.
- Commits `d80a305` (test) and `5a8141c` (feat) verified in `git log`.
- Plan-level verification re-run: `tsc --noEmit` exit 0; full suite 14 passed; `-t "one-time-use"` 2 passed; `-t "expiry"` 4 passed.

---
*Phase: 01-transferstore-adapters*
*Completed: 2026-06-05*
