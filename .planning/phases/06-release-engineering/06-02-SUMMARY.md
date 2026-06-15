---
phase: 06-release-engineering
plan: 02
status: complete
completed: 2026-06-14
requirements:
  - RELEASE-01
---

# Plan 06-02 Summary — Publish-hygiene metadata + semantic-release config

## What was built

Wired RELEASE-01: a merge to `main` will derive the next version from Conventional
Commits and produce a tag, npm publish (with Sigstore provenance), CHANGELOG entry,
and GitHub Release. Also made the published tarball slim and trustworthy via the D-03
publish-hygiene metadata.

## Tasks

- **Task 1 — D-03 metadata on `packages/core/package.json`:** Added `files: ["dist"]`,
  `publishConfig` (access public + provenance true), `engines.node >=18` (the CONSUMER
  floor, not the Node-22 tooling floor), `repository`/`homepage`/`bugs` pointing at
  `github.com/azatdavliatshin/next-auth-bridge`, and a 10-entry `keywords` array. The
  existing `exports` map (`.` + `./store/kv`) and the tsdown build script from Plan 01
  were preserved exactly.
- **Task 2 — root `.releaserc.json`:** Authored the six-plugin Conventional chain in run
  order (commit-analyzer -> release-notes-generator -> changelog -> npm -> git ->
  github), `branches: ["main"]`, npm plugin `pkgRoot: packages/core`, git plugin assets
  `[CHANGELOG.md, packages/core/package.json]` with a `[skip ci]`-guarded commit message
  (loop guard).
- **Task 3 — root `package.json` + lockfile:** Created the root manifest fresh as a
  private workspace root (`next-auth-bridge-workspace`). Installed the seven release
  packages under `devDependencies` via `pnpm add -D -w` (no `dependencies` block, no
  stray tsdown). Regenerated `pnpm-lock.yaml`; `pnpm install --frozen-lockfile` passes.

## Key files

### Created
- `.releaserc.json` — semantic-release config (six-plugin chain, pkgRoot packages/core)
- `package.json` (root) — private workspace manifest with release tooling in devDeps and
  `test`/`build`/`release` scripts

### Modified
- `packages/core/package.json` — D-03 publish-hygiene block
- `pnpm-lock.yaml` — regenerated with the root release devDependencies

## Versions installed (Standard Stack)
- semantic-release 25.0.5
- @semantic-release/commit-analyzer 13.0.1
- @semantic-release/release-notes-generator 14.1.1
- @semantic-release/changelog 6.0.3
- @semantic-release/npm 13.1.5
- @semantic-release/git 10.0.1
- @semantic-release/github 12.0.8

## Verification
- `node -e require()` parse checks pass for both `packages/core/package.json` and `.releaserc.json`.
- D-03 assertion script: ok (files/provenance/access/engines/repo/homepage/bugs/keywords/exports).
- .releaserc assertion script: ok (branches, all six plugins, pkgRoot, [skip ci]).
- Root manifest assertion: ok (no dependencies block, all seven devDeps, no tsdown).
- `pnpm install --frozen-lockfile`: clean.
- Full suite green: 14 files / 124 tests.
- Zero internal `RELEASE-`/`D-0`/`THREAT-` markers in any committed file.

## Deviations

1. **Inline execution on the main `dev` tree (not a worktree).** Two prior worktree
   executor dispatches for this plan were blocked by a persistent, non-deterministic
   Bash denial inside the subagent worktree sessions (couldn't run the branch-safety
   gate, git, or pnpm). With user approval, the orchestrator executed this single-writer
   wave inline using its own working Bash. Atomic per-task commits and verifications were
   preserved; only the worktree isolation was dropped (safe here — 06-02 is the sole plan
   in Wave 2).
2. **Root package name is `next-auth-bridge-workspace`** (private) to avoid colliding with
   the publishable package name `next-auth-bridge` at `packages/core`. The plan left the
   exact root manifest shape to discretion; `private: true` + a distinct name is the
   conventional pnpm-workspace-root pattern.

## Commits
- `2db33ce` build(06-02): add D-03 publish-hygiene metadata to packages/core
- `20c50bc` ci(06-02): add root semantic-release config (six-plugin chain, pkgRoot packages/core)
- `0e37d01` build(06-02): add root manifest with semantic-release devDeps, regenerate lockfile
