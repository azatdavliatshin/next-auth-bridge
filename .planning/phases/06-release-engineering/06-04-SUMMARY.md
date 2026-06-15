---
phase: 06-release-engineering
plan: 04
status: complete
completed: 2026-06-14
requirements:
  - RELEASE-04
  - RELEASE-05
human_action_pending:
  - "Apply + verify branch protection on main (RELEASE-04) — REQUIRED before dev->main merge"
  - "Open authjs.dev cross-context bridge recipe PR (RELEASE-05) — deferred to post-publish, optional"
---

# Plan 06-04 Summary — Release-safety gate + governance/discovery docs

## What was built

The final, human-gated layer of the release pipeline: the governance runbook, the D-02
dry-run/pack inspection (human-signed), and the in-repo Auth.js recipe source. Two
maintainer-only GitHub-side actions (branch protection, cross-repo PR) are deferred as
tracked human-action items per maintainer direction.

## Tasks

- **Task 1 (auto) — `docs/release-governance.md`:** Maintainer runbook covering NPM_TOKEN
  setup + npm name-ownership check, the exact `gh api` branch-protection recipe for `main`
  (PR-only + required PR-title check) with the scoped release-token bypass actor for the
  `@semantic-release/git` CHANGELOG re-commit (keep-git decision), per-clone
  `core.hooksPath` hook activation, and the D-02 dry-run gate procedure. Marker-free, no
  per-file license header.
- **Task 2 (checkpoint: human-verify, D-02) — APPROVED:** Ran the automated inspection and
  the human signed off. See "D-02 gate result" below.
- **Task 3 (auto) — `docs/recipes/authjs-cross-context-bridge.mdx`:** In-repo source for the
  authjs recipe. Cites the REAL public API (`createAuthBridge` returning `{ bridge, consume }`,
  `createInMemoryTransferStore`, the `./store/kv` subpath `createKVTransferStore`) verified
  against `packages/core/src/index.ts`. Honest security framing sourced from
  `docs/threat-model.md` (no token in URL, 256-bit one-time codes, PKCE preserved,
  partitioned CHIPS cookie, postMessage origin checks). Target slug noted at the top:
  `cross-context-iframe-bridge`.
- **Task 4 (checkpoint: human-action) — DEFERRED (optional, post-publish):** Opening the
  cross-repo PR against `nextauthjs/next-auth`. The recipe source exists in-repo (Task 3),
  ready to copy. Tracked as a human-action item.
- **Task 5 (checkpoint: human-action) — DEFERRED (REQUIRED before dev->main merge):**
  Applying branch protection on `main`. Recipe documented in Task 1. The maintainer will
  apply and verify it (and review the `enforce_admins=false` / bypass approach) before the
  merge that triggers the first publish. Tracked as a blocking human-action item.

## D-02 gate result (human-signed)

`cd packages/core && npm publish --dry-run` (pnpm 9 `pack --dry-run` is unsupported; used
the documented npm fallback):

- Tarball `next-auth-bridge@0.1.0` — 7 files, 16.4 kB packed:
  `dist/index.js`, `dist/index.d.ts`, `dist/store/kv.js`, `dist/store/kv.d.ts`, two
  hashed tsdown shared-chunk files (`generate-code-*.js`, `types-*.d.ts` — legitimate
  shared splits), and `package.json`.
- All four canonical artifacts present; NO `src/`, `__tests__/`, `*.test.ts`, or
  `tsdown.config.ts`. `files: ["dist"]` honored.
- `pnpm exec semantic-release --dry-run` (GITHUB_TOKEN supplied via `gh auth token` — NOT
  silently skipped per the plan): all six plugins loaded cleanly; config valid; correctly
  refused to derive a version from `dev` (releases only from `main`). No tags exist and
  `feat:` commits are present, so the first merge to `main` derives a minor (>= 0.1.0).

### Finding flagged at sign-off (follow-up spawned)

The published tarball does NOT include LICENSE or README — they live at the repo root, but
`pkgRoot` is `packages/core` and `files: ["dist"]`, so npm packs only from `packages/core`
(which has neither file). Approved with a spawned follow-up task: add a `prepack` script in
`packages/core` that copies the root LICENSE + README into the package dir (and fix the
README's inaccurate Quick Start first). Must land before the dev->main merge.

## Key files

### Created
- `docs/release-governance.md` — maintainer release runbook
- `docs/recipes/authjs-cross-context-bridge.mdx` — in-repo authjs recipe source

## Verification
- Task 1 automated verify: ok (branch protection, NPM_TOKEN, core.hooksPath, dry-run; 0 markers; no license header).
- Task 2 (D-02): tarball assertions pass; semantic-release dry-run clean; human approved.
- Task 3 automated verify: ok (next-auth-bridge + createAuthBridge cited and confirmed in source; 0 markers; no license header).

## Deviations

1. **Inline execution on `dev` (not a worktree)** — same persistent subagent Bash denial
   that blocked 06-02; this plan also has human checkpoints best handled inline. Atomic
   per-task commits preserved.
2. **`pnpm pack --dry-run` unsupported on pnpm 9** — used the plan's documented fallback
   `cd packages/core && npm publish --dry-run`.
3. **Tasks 4 and 5 deferred** as tracked human-action items (maintainer-only GitHub-side
   ops). Task 5 is REQUIRED before the dev->main merge; Task 4 is optional/post-publish.

## Commits
- `509d210` docs(06-04): add release-governance runbook (branch protection, NPM_TOKEN, dry-run gate)
- `fe64d67` docs(06-04): add Auth.js cross-context bridge recipe (RELEASE-05 source)
