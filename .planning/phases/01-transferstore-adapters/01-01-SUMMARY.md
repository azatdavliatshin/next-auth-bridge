---
phase: 01-transferstore-adapters
plan: 01
subsystem: infra
tags: [typescript, vitest, tsup, upstash-redis, pnpm-workspace, csprng, transfer-store]

# Dependency graph
requires: []
provides:
  - "packages/core greenfield library skeleton (pnpm workspace, strict tsconfig, vitest, two-entry tsup reserving ./store/kv)"
  - "Locked TransferStore interface (create/consume) — freezes verbatim into v0.2"
  - "Mode-agnostic TransferPayload provisional shape { authCookieValue: string } (STORE-01/D-06)"
  - "Shared TransferStoreOptions { ttlSeconds?; now? } for the TTL clamp + injectable clock (D-07/D-14)"
  - "generateCode() — the single 256-bit CSPRNG entropy site (D-01/STORE-04)"
  - "runTransferStoreContract(makeStore) — adapter-agnostic contract suite (D-15)"
  - "createFakeUpstashRedis(now) — clock-aware in-memory fake of @upstash/redis (D-15)"
affects: [01-02 in-memory adapter, 01-03 KV adapter, Phase 2 bridge/consume routes]

# Tech tracking
tech-stack:
  added: [typescript@5.9.3, vitest@4.1.8, tsup@8.5.1, "@types/node", "@upstash/redis@1.38.0 (optional peerDep + devDep)"]
  patterns:
    - "Single entropy site (D-01): generateCode is the only randomBytes call"
    - "Adapter-agnostic contract suite invoked with a store factory (D-15)"
    - "Injectable clock seam (D-14): now() in options, no real waits / no global timer mocks"
    - "NodeNext ESM: relative imports use explicit .js extensions"

key-files:
  created:
    - packages/core/package.json
    - packages/core/tsconfig.json
    - packages/core/vitest.config.ts
    - packages/core/tsup.config.ts
    - packages/core/src/index.ts
    - packages/core/src/transfer-store/types.ts
    - packages/core/src/transfer-store/generate-code.ts
    - packages/core/src/transfer-store/__tests__/generate-code.test.ts
    - packages/core/src/transfer-store/__tests__/contract.ts
    - packages/core/src/transfer-store/__tests__/fake-upstash-redis.ts
    - pnpm-workspace.yaml
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Resolvable pnpm filter is `next-auth-bridge` (the published name); the `@next-auth-bridge/core` form in VALIDATION.md does NOT resolve — downstream verify commands must use --filter next-auth-bridge"
  - "TransferPayload provisional shape locked to { authCookieValue: string }, mode-agnostic (STORE-01/D-06); Phase 2 finalizes exact fields"
  - "ttlSeconds > 60 THROWS at construction (resolved Open Question 2); the contract suite asserts this — enforced per-adapter in Plans 02/03"
  - "FakeUpstashRedis stores the value object directly (no JSON), matching SDK auto-(de)serialization (resolved Open Question 1)"
  - "tsup reserves the src/transfer-store/kv.ts entry now; the file itself is authored in Plan 03"

patterns-established:
  - "MIT SPDX license header on every new .ts under packages/ (per CLAUDE.md)"
  - "Test scaffolding (fake, contract) may relax to unknown/casts; non-test source has zero any"
  - "Security tests comment THREAT-02 for Phase 4 threat-model traceability"

requirements-completed: [STORE-01, STORE-04]

# Metrics
duration: 6 min
completed: 2026-06-05
---

# Phase 1 Plan 01: TransferStore Foundation & Test Harness Summary

**Greenfield `packages/core` skeleton plus the locked `TransferStore` interface, mode-agnostic `TransferPayload`, the single 256-bit CSPRNG `generateCode()` site, the adapter-agnostic `runTransferStoreContract` suite, and a clock-aware `createFakeUpstashRedis` fake — the foundation both adapter plans build against.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-05T09:11Z (approx)
- **Completed:** 2026-06-05T09:18Z
- **Tasks:** 3
- **Files created:** 11 (10 in packages/core + pnpm-workspace.yaml); 1 modified (pnpm-lock.yaml)

## Accomplishments
- Stood up the greenfield `packages/core` package: pnpm workspace wiring, strict `tsconfig` (`strict: true`, NodeNext ESM), Vitest config, and a two-entry tsup build that reserves the `./store/kv` subpath. `pnpm install` resolves; `pnpm exec tsc --noEmit` exits 0.
- Locked the `TransferStore` interface verbatim from D-01/D-03 (`create(payload): Promise<{ code: string }>`, `consume(code): Promise<TransferPayload | null>`), the concrete mode-agnostic `TransferPayload` (`{ authCookieValue: string }`), and a shared `TransferStoreOptions` (`{ ttlSeconds?; now? }`). All re-exported from the main entry.
- Centralized 256-bit CSPRNG entropy in a single site, `generateCode()` = `randomBytes(32).toString('hex')`, and proved STORE-04 with a passing entropy test (length-64 lowercase-hex + 10,000-uniqueness).
- Built the reusable D-15 contract suite covering STORE-01/04/05/06 negative cases, and the clock-aware FakeUpstashRedis modeling `set({ex})` + atomic `getdel` against an injected clock — both ready for Plans 02/03 to invoke.

## Task Commits

Each task was committed atomically (Task 2 is TDD → test then feat):

1. **Task 1: Scaffold packages/core skeleton** — `e270a3c` (chore)
2. **Task 2 (RED): Failing entropy test** — `d1e2c9a` (test)
3. **Task 2 (GREEN): Interface + TransferPayload + generateCode** — `29cc4c5` (feat)
4. **Task 3: Contract suite + clock-aware fake** — `1e677c8` (test)

**Plan metadata:** committed after this SUMMARY (docs).

## Downstream Contract (load-bearing for Plans 02 / 03)

### (a) Resolvable pnpm filter
`pnpm --filter next-auth-bridge test` — VERIFIED resolving (2 tests pass). The `@next-auth-bridge/core` form referenced in VALIDATION.md does NOT resolve (no such scope). Downstream `--filter` verify commands MUST use `next-auth-bridge`. The package-local `cd packages/core && pnpm test` also works.

### (b) TransferPayload provisional shape (final for Phase 1)
```ts
export interface TransferPayload {
  authCookieValue: string;
}
```
Mode-agnostic, no popup/PWA/mode-discriminating field (STORE-01/D-06). Phase 2 finalizes exact fields without changing the interface.

### (c) Exact contract-suite test titles (for `-t` filters)

`contract.ts` → `runTransferStoreContract(makeStore)` registers these inside `describe("TransferStore contract (D-15 / THREAT-02)")`:

| `it(...)` title | Requirement | Suggested `-t` filter |
|-----------------|-------------|------------------------|
| `create() returns a 256-bit (64 lowercase-hex-char) code` | STORE-04 | `-t "256-bit"` |
| `round-trips the payload with no mode field on the stored shape` | STORE-01 | `-t "no mode field"` |
| `one-time-use: second consume of the same code returns null` | STORE-05 | `-t "one-time-use"` |
| `one-time-use under concurrency: exactly one of two consumes wins` | STORE-05 | `-t "one-time-use"` (matches both) |
| `expiry: consume after the clock advances past the TTL returns null` | STORE-06 | `-t "expiry"` |
| `expiry: consume just before the TTL boundary still returns the payload` | STORE-06 | `-t "expiry"` |
| `expiry guard: constructing with ttlSeconds 61 throws` | STORE-06 | `-t "expiry"` |
| `consume of an unknown (never-created) code returns null` | D-03 | `-t "unknown"` |

Note: `-t "256-bit"` also matches the standalone entropy test title `generates 256-bit (64 lowercase-hex-char) codes` in `generate-code.test.ts`. `-t "one-time-use"` and `-t "expiry"` each match multiple contract `it`s by design.

Factory signature the contract suite requires from each adapter:
```ts
type MakeStore = (opts: TransferStoreOptions) => TransferStore; // TransferStoreOptions = { ttlSeconds?: number; now?: () => number }
```

### (d) Entropy test passes
`pnpm exec vitest run -t "256-bit"` → PASS (1 passed, the uniqueness sibling skipped by title filter). Full file `pnpm exec vitest run generate-code` → 2 passed (shape + 10k-uniqueness).

## Files Created/Modified
- `pnpm-workspace.yaml` — workspace wiring (`packages/*`, `examples/*`)
- `packages/core/package.json` — name `next-auth-bridge`, exports map (`.` + `./store/kv`), `@upstash/redis` optional peerDep + devDep, test/build scripts
- `packages/core/tsconfig.json` — `strict: true`, NodeNext ESM, noEmit
- `packages/core/vitest.config.ts` — one-shot config (`*.test.ts` only)
- `packages/core/tsup.config.ts` — two entries (`index`, `store/kv`), ESM, dts
- `packages/core/src/index.ts` — re-exports TransferStore, TransferPayload, TransferStoreOptions
- `packages/core/src/transfer-store/types.ts` — locked interface + payload + options
- `packages/core/src/transfer-store/generate-code.ts` — the single CSPRNG site
- `packages/core/src/transfer-store/__tests__/generate-code.test.ts` — STORE-04 entropy test
- `packages/core/src/transfer-store/__tests__/contract.ts` — shared D-15 suite
- `packages/core/src/transfer-store/__tests__/fake-upstash-redis.ts` — clock-aware fake
- `pnpm-lock.yaml` — created/updated by `pnpm install`

## Decisions Made
- Used NodeNext module resolution → relative imports carry explicit `.js` extensions (e.g. `from "../types.js"`). Plans 02/03 must follow this when importing the contract suite and types.
- Added `noUncheckedIndexedAccess` and `verbatimModuleSyntax` to the strict tsconfig for stronger guarantees; harmless to downstream code.
- pnpm-workspace.yaml also lists `examples/*` so the existing reference-app directories slot in without a follow-up edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] VALIDATION.md `@next-auth-bridge/core` filter does not resolve**
- **Found during:** Task 1 (verifying the resolvable filter for downstream verify commands, per the plan's explicit instruction to document the actual filter)
- **Issue:** VALIDATION.md and RESEARCH reference a `pnpm --filter @next-auth-bridge/core` form alongside `next-auth-bridge`. The package `name` is `next-auth-bridge` (the published name, D-11) with no `@next-auth-bridge/core` scope, so the scoped filter matches no project.
- **Fix:** Confirmed and recorded the resolvable filter as `next-auth-bridge`. No code change needed — the plan already mandated keeping `name: next-auth-bridge`; this documents the resolvable form so Plans 02/03 use `--filter next-auth-bridge`.
- **Files modified:** none (documentation-only resolution in this SUMMARY, section (a))
- **Verification:** `pnpm --filter next-auth-bridge test` → 2 passed; `pnpm --filter @next-auth-bridge/core test` → "No projects matched the filters"
- **Committed in:** n/a (no code change)

---

**Total deviations:** 1 (documentation clarification, no code change — Rule 3 boundary resolution the plan explicitly asked to surface)
**Impact on plan:** No scope change. The plan anticipated this ambiguity and asked for the resolvable filter to be documented; done. All locked decisions implemented as written.

## Issues Encountered
None. All three task verifications and the full plan-level verification passed on first run.

## Known Stubs
- `packages/core/src/transfer-store/kv.ts` is referenced by `tsup.config.ts` but intentionally NOT created here — the KV adapter entry file is authored in Plan 03 (the tsup entry reserves the `./store/kv` build surface now). The full `pnpm build` is therefore not run in this plan; `tsc --noEmit` and `vitest` are the gates. This is the plan's explicit design (artifacts_this_plan_produces), not an accidental stub.

## Next Phase Readiness
- Wave 1 foundation complete. Wave 2 plans 01-02 (in-memory adapter) and 01-03 (KV adapter) are unblocked: both import `TransferStore`/`TransferPayload`/`TransferStoreOptions` from `../types.js`, `runTransferStoreContract` from `./__tests__/contract.js`, and `createFakeUpstashRedis` from `./__tests__/fake-upstash-redis.js` (KV plan only). Each adapter must construct via `(opts: TransferStoreOptions) => TransferStore` and pass the contract suite.
- The `./store/kv` subpath is reserved in both the exports map and tsup; Plan 03 authors `src/transfer-store/kv.ts` to fill it.

## Self-Check: PASSED
- All 11 created files verified present on disk.
- All 4 task commits (`e270a3c`, `d1e2c9a`, `29cc4c5`, `1e677c8`) verified in `git log`.
- Plan-level verification re-run: `tsc --noEmit` exit 0; entropy test `-t "256-bit"` passes; exports map exposes `.` + `./store/kv` with `@upstash/redis` optional peerDep + devDep; `runTransferStoreContract` and `createFakeUpstashRedis` symbols present and compile.

---
*Phase: 01-transferstore-adapters*
*Completed: 2026-06-05*
