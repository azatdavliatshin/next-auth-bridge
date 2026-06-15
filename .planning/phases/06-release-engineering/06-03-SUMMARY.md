---
phase: 06-release-engineering
plan: 03
subsystem: release-ci
tags: [ci, governance, conventional-commits, npm-publish, provenance]
requires:
  - semantic-release config (Plan 02 — keep-git decision)
provides:
  - commit-msg-hook
  - npm-publish-workflow
  - pr-title-check
affects:
  - .githooks/commit-msg
  - .github/workflows/release.yml
  - .github/workflows/pr-title.yml
tech-stack:
  added:
    - amannn/action-semantic-pull-request@v6.1.1 (SHA-pinned)
  patterns:
    - hand-rolled bash git hook (zero runtime deps, mirrors .githooks/pre-commit)
    - subprocess-driven Vitest test via node:child_process spawnSync
    - GitHub-hosted runner + id-token:write for npm Sigstore provenance
key-files:
  created:
    - .githooks/commit-msg
    - packages/core/src/__tests__/commit-msg.test.ts
    - .github/workflows/release.yml
    - .github/workflows/pr-title.yml
  modified: []
decisions:
  - Pinned amannn/action-semantic-pull-request to full SHA (48f256284...) of v6.1.1 for supply-chain hardening (T-06-12) rather than the floating @v6 tag.
metrics:
  duration: ~2 min
  completed: 2026-06-14
  tasks: 3
  files: 4
---

# Phase 6 Plan 03: Commit Governance & Publish CI Summary

Hand-rolled `.githooks/commit-msg` Conventional-Commits validator (subprocess-tested via Vitest), an npm publish-on-merge-to-main workflow with Sigstore provenance, and a `pull_request_target` PR-title check that guards the squash-merge subject semantic-release parses.

## What Was Built

- **`.githooks/commit-msg`** (D-04, RELEASE-03): a zero-dependency bash hook mirroring the existing `.githooks/pre-commit` style (`#!/usr/bin/env bash`, `set -uo pipefail`, self-documenting header with the `git config core.hooksPath .githooks` activation note). Reads the subject via `head -1 "$1"`, passes `Merge*|Revert*|fixup!*|squash!*` through via a `case` statement, and validates against `^(feat|fix|docs|refactor|test|chore|build|ci|perf|style)(\([a-z0-9._-]+\))?(!)?: .+`. Rejects with a human-readable multi-line block + `exit 1`. Committed mode 100755 (executable).
- **`packages/core/src/__tests__/commit-msg.test.ts`** (RELEASE-03): a Vitest test that resolves the repo-root-relative absolute path to the hook (four levels up from the test file) and drives it through `node:child_process` `spawnSync` against temp message files written to `os.tmpdir()`. Covers paired accept (10 types, scoped, `!`, scoped-`!`), reject (free text, unknown type, no description, empty, missing colon), and passthrough (Merge / Revert / fixup! / squash!) cases.
- **`.github/workflows/release.yml`** (RELEASE-02): `on: push: branches: [main]` only; `permissions` with `contents/issues/pull-requests/id-token: write`; one `release` job on `ubuntu-latest` (GitHub-hosted, required for provenance); `actions/checkout@v4` with `fetch-depth: 0`; `pnpm/action-setup@v4`; `actions/setup-node@v4` with `node-version: 22` + `registry-url: https://registry.npmjs.org` + `cache: pnpm`; `pnpm install --frozen-lockfile`; `pnpm --filter next-auth-bridge build`; final `pnpm exec semantic-release` with `GITHUB_TOKEN`, `NPM_TOKEN`, `NPM_CONFIG_PROVENANCE: "true"`.
- **`.github/workflows/pr-title.yml`** (D-05): `on: pull_request_target: types: [opened, edited, synchronize]`; `permissions: pull-requests: read`; one `validate` job using `amannn/action-semantic-pull-request` SHA-pinned to v6.1.1, with `GITHUB_TOKEN` env and all ten Conventional-Commits types in `with.types`. No checkout step — reads the PR title from the event payload only (Pitfall 5).

## Verification

- Hook on `feat: ok` exits 0; on `nope: bad` exits non-zero; on `Merge branch x` exits 0.
- `pnpm --filter next-auth-bridge test`: 13 test files, 119 tests, all green (includes commit-msg.test.ts).
- Both workflow YAML files parse via `python3 -c "yaml.safe_load(...)"` and carry every required key (id-token / node 22 / semantic-release / fetch-depth 0 for release; pull_request_target / SHA-pinned amannn action / 10 types / no checkout for pr-title).
- `grep -c 'RELEASE-\|D-0\|THREAT-'` returns 0 for all four files; no emoji in any file.

## Deviations from Plan

None functional. One discretionary call within the plan's stated latitude: Task 3 pins `amannn/action-semantic-pull-request` to the full commit SHA `48f256284bd46cdaab1048c3721360e808335d50` (v6.1.1) instead of the floating `@v6` tag. The plan and acceptance criteria explicitly permit "a pinned full SHA of v6.x" and note SHA pinning is "preferred for supply-chain hardening" (mitigates T-06-12). The plan's literal verify grep (`@v6`) was correspondingly adapted to grep the SHA; all acceptance criteria are satisfied.

Note: `pnpm install --frozen-lockfile` was run once in the worktree (node_modules was absent) so the Vitest suite could execute. No lockfile or manifest changes resulted — `git status` showed only the four new artifact files.

## Threat Model Notes

No bridge / consume / cookie / wrapper-detection logic touched — these are CI workflows + a git hook only. No `docs/threat-model.md` update required (consistent with the plan's threat_model section). The plan's STRIDE register (T-06-08 through T-06-12) is satisfied: NPM_TOKEN referenced only as a secret and consumed only by the publish job; `id-token: write` + GitHub-hosted runner + `NPM_CONFIG_PROVENANCE: "true"` yield provenance; PR-title check + commit-msg hook together close the version-derivation integrity gap; `pull_request_target` reads title only with `pull-requests: read`; third-party action SHA-pinned.

## Self-Check: PASSED

- Files: all 4 FOUND (.githooks/commit-msg, packages/core/src/__tests__/commit-msg.test.ts, .github/workflows/release.yml, .github/workflows/pr-title.yml)
- Commits: 9e27ca2, 22b5883, 8f1a784 all FOUND in git log
- No emoji, no internal markers in any artifact

## Commits

- `9e27ca2` feat(06-03): add commit-msg hook with subprocess-driven test
- `22b5883` ci(06-03): add npm publish workflow with provenance
- `8f1a784` ci(06-03): add PR-title Conventional-Commits check
