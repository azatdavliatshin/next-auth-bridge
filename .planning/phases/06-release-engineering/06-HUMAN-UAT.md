---
status: partial
phase: 06-release-engineering
source: [06-VERIFICATION.md, 06-REVIEW.md, 06-04-SUMMARY.md]
started: 2026-06-14
updated: 2026-06-14
---

## Current Test

[awaiting human action]

## Tests

### 1. Apply branch protection on `main` (RELEASE-04, Task 5)
expected: `main` blocks direct pushes, requires the PR-title status check, and permits only the scoped release-automation bypass actor (for the `@semantic-release/git` `[skip ci]` CHANGELOG re-commit). Apply via the documented `gh api` recipe in `docs/release-governance.md`; review the `enforce_admins=false` / bypass-actor approach yourself.
priority: REQUIRED before the dev->main merge
result: RESOLVED 2026-06-14 — repo made public (Free-plan private repos can't enforce branch protection). Final state: a repository **ruleset** ("main protection", id 17659258) governs `main` — PR required (0 approvals, solo), required status check `pr-title / validate` (strict), block deletion + force-push, linear history, with an **owner/admin bypass actor** (RepositoryRole admin) so the repo owner can push the `@semantic-release/git` CHANGELOG re-commit. Classic branch protection was REPLACED by the ruleset because a personal repo cannot add the GitHub Actions bot as a bypass actor; the release therefore pushes as the owner via the RELEASE_TOKEN PAT. (gh recipe needs a JSON body via `--input -`, not `-f`, which 422s on the integer field.)

### 2. Add prepack LICENSE/README copy to `packages/core` (CR-02 follow-up)
expected: `cd packages/core && npm publish --dry-run` lists `LICENSE` and `README.md` alongside `dist/`. A `prepack` script copies the root `LICENSE` + the corrected root `README.md` into `packages/core`; the README's inaccurate Quick Start is fixed first. (Spawned follow-up task `task_0c80fade`.)
priority: REQUIRED before the dev->main merge
result: RESOLVED 2026-06-14 — README Quick Start corrected (quick task prepublish-doc-fixes, commit cfed59e); prepack copy script added (packages/core/scripts/copy-package-docs.mjs, commit ecbcde3). `npm publish --dry-run` now lists LICENSE + README.md (9 files, was 7).

### 3. Open the Auth.js cross-context bridge recipe PR (RELEASE-05, Task 4)
expected: A PR is open against `nextauthjs/next-auth` adding `docs/pages/guides/cross-context-iframe-bridge.mdx` (copied from `docs/recipes/authjs-cross-context-bridge.mdx`, adapted to authjs docs conventions) + one `_meta.js` registration line. Re-confirm the live docs structure (Nextra vs Fumadocs) before opening. PR URL recorded.
priority: deferred — post-publish, optional
result: [pending]

### 4. Switch npm publishing to Trusted Publishing / OIDC (post-first-publish)
expected: After the first `v0.1.0` publish (which must use `NPM_TOKEN` — a brand-new package cannot use OIDC), configure a trusted publisher on npmjs.com (org `azatdavliatshin` / repo `next-auth-bridge` / workflow `release.yml`), then remove the `NPM_TOKEN` env line from `release.yml` and delete the `NPM_TOKEN` repo secret; optionally set npm "Require 2FA and disallow tokens". Procedure documented in docs/release-governance.md section 1, Phase B. Workflow already prepped: `id-token: write` set, Node bumped to 22.14 (npm >= 11.5.1 floor), inline reminder on the Release step.
priority: post-first-publish — security hardening (not a merge blocker)
result: [pending]

## Summary

total: 4
passed: 2
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
