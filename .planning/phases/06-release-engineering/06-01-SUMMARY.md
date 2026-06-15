---
phase: 06-release-engineering
plan: 01
subsystem: infra
tags: [tsdown, rolldown, tsup, build, esm, bundler, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: tsup two-entry ESM+dts build config and the ./store/kv exports-map subpath
provides:
  - tsdown-based two-entry ESM+dts package build (replaces tsup)
  - dist-parity Wave 0 smoke test asserting the four emitted artifacts + ./store/kv subpath resolution
affects: [06-02-publish-metadata, 06-04-dry-run-gate, release-pipeline]

# Tech tracking
tech-stack:
  added: [tsdown ^0.22.2 (rolldown 1.1.1)]
  patterns: ["fixedExtension: false pins ESM output to .js/.d.ts so it matches the package.json exports map under \"type\": \"module\""]

key-files:
  created:
    - packages/core/tsdown.config.ts
    - packages/core/src/__tests__/dist-parity.test.ts
  modified:
    - packages/core/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Set tsdown fixedExtension: false to emit .js/.d.ts (not the .mjs/.d.mts default) so the existing exports map resolves unchanged"
  - "Kept format ESM-only per D-01 — no CJS output added during the migration"
  - "Did not add an engines field — the Node-22 tsdown tooling floor must not leak into consumer engines (Plan 02 owns engines.node >=18)"

patterns-established:
  - "dist-parity smoke test: assert post-build artifact existence on disk + dynamic-import resolution of the subpath, guarding the published surface against a dropped/renamed build entry"

requirements-completed: [RELEASE-04]

# Metrics
duration: ~4min
completed: 2026-06-14
---

# Phase 6 Plan 01: tsup → tsdown Build Migration Summary

**Migrated the packages/core build from the unmaintained tsup to its Rolldown-team successor tsdown, preserving the two-entry ESM+dts surface exactly (`.` + `./store/kv`), and added a Wave 0 dist-parity smoke test that fails if either published artifact ever stops emitting.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-14T10:03Z
- **Completed:** 2026-06-14T10:07Z
- **Tasks:** 3 completed
- **Files modified:** 4 (2 created, 1 modified, 1 deleted; +pnpm-lock.yaml)

## Accomplishments

- **Task 1 — dist-parity smoke test:** Created `packages/core/src/__tests__/dist-parity.test.ts`, a Vitest integration test that asserts all four post-build artifacts exist (`dist/index.js`, `dist/index.d.ts`, `dist/store/kv.js`, `dist/store/kv.d.ts`) and that the built `./store/kv` module resolves via dynamic import. No internal requirement-ID markers; self-documenting prose only. Authored before the migration so a tsdown regression is caught.
- **Task 2 — tsup → tsdown migration:** Replaced `tsup.config.ts` with `tsdown.config.ts` (same two entries, `format: ["esm"]`, `dts`, `clean`), switched `scripts.build` to `tsdown`, removed the `tsup` devDep, and added `tsdown ^0.22.2`. Verified `npm view tsdown version` = 0.22.2 and that tsdown has no postinstall script (T-06-01 mitigation). Ran `pnpm install` + build; all four canonical dist artifacts emit.
- **Task 3 — green test gate:** Built with tsdown and ran the full `packages/core` Vitest suite: 13 files / 110 tests pass, including the new 5-assertion dist-parity test. Confirmed `./store/kv` resolves at runtime (`node -e import(...)` exports `createKVTransferStore`). No file changes were needed in Task 3 — it is a verification gate satisfied by the Task 1/2 commits, so no empty commit was created.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] tsdown default output extension broke the exports map**
- **Found during:** Task 2 (first build)
- **Issue:** tsdown defaults `fixedExtension` to `true` when `platform === 'node'` (the default platform), so the first build emitted `dist/index.mjs` / `dist/index.d.mts` / `dist/store/kv.mjs` / `dist/store/kv.d.mts`. The package.json exports map (canonical, untouched per plan) points at `.js` / `.d.ts`, so none of the four required artifacts existed and the published subpath would have dangled — exactly the Pitfall-3 / T-06-02 regression the dist-parity test guards against. tsup had emitted `.js` because it keys extension off the package `"type": "module"`.
- **Fix:** Added `fixedExtension: false` to `tsdown.config.ts`. With it, the ESM extension tracks the package type (`"type": "module"` → `.js`), restoring the exact tsup output surface. Documented the rationale in the config header comment.
- **Files modified:** `packages/core/tsdown.config.ts`
- **Commit:** db9d0fa (folded into the Task 2 migration commit, since the config did not work without it)
- **Verification:** Rebuilt; all four `.js`/`.d.ts` artifacts present; dist-parity test green; `node` dynamic-import of `dist/store/kv.js` resolves.

## Notes / Observations

- tsdown code-splits the two entries, emitting two shared internal chunks (`dist/generate-code-*.js`, `dist/types-*.d.ts`) alongside the four entry artifacts. These are internal chunks referenced by the entry files, not part of the published exports surface, and `dist/` is gitignored (regenerated on every build). No action needed.
- `core.hooksPath` in this clone resolves to `.git/hooks` (default), not the project's `.githooks/`, and there is no `commit-msg` hook installed. Commits were made without `--no-verify`; running hooks is a no-op in this environment.
- `engines` field intentionally left absent (T-06-03 accept disposition) — Plan 02 adds `engines.node >=18`.

## Verification Evidence

- `pnpm --filter next-auth-bridge build` → emits `dist/index.js`, `dist/index.d.ts`, `dist/store/kv.js`, `dist/store/kv.d.ts` via tsdown v0.22.2 / rolldown v1.1.1.
- `pnpm --filter next-auth-bridge test` → 13 files / 110 tests pass (dist-parity = 5/5).
- `packages/core/tsup.config.ts` removed; no `tsup` reference remains in package.json.
- `grep -c 'RELEASE-\|D-0\|THREAT-'` on both new files returns 0.
- `head -5 packages/core/tsdown.config.ts` contains no SPDX/Copyright/@license token (declaration-once per CLAUDE.md / RELEASE-04 reconciliation).
- No `engines` field in package.json.

## Self-Check: PASSED

- FOUND: packages/core/tsdown.config.ts
- FOUND: packages/core/src/__tests__/dist-parity.test.ts
- FOUND commit: 80f8204 (test — dist-parity smoke test)
- FOUND commit: db9d0fa (build — tsup → tsdown migration)
