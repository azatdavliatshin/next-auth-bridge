---
phase: 06-release-engineering
reviewed: 2026-06-14T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - .githooks/commit-msg
  - .github/workflows/pr-title.yml
  - .github/workflows/release.yml
  - .releaserc.json
  - package.json
  - packages/core/package.json
  - packages/core/src/__tests__/commit-msg.test.ts
  - packages/core/src/__tests__/dist-parity.test.ts
  - packages/core/tsdown.config.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-06-14
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 06 release-engineering surface: the commit-msg governance hook,
two CI workflows (npm publish + PR-title check), the semantic-release config, both
manifests, and two new tests. The CI/CD security posture is mostly sound — SHA-pinned
third-party action, least-privilege `pull-requests: read` on the `pull_request_target`
workflow with no checkout of PR code, `id-token: write` correctly scoped for provenance,
and NPM_TOKEN consumed only by the publish job.

However the release workflow has two correctness defects that will fail on the **first**
merge to `main`: (1) `pnpm/action-setup@v4` has no resolvable pnpm version anywhere in
the repo, which aborts the Setup pnpm step; and (2) the published tarball ships neither
LICENSE nor README despite `"license": "MIT"` — the prepack fix that 06-04 flagged as
"must land before dev->main merge" has not landed. Several warnings cover loop/concurrency
guards, the commit-msg hook's over-strict scope regex, and a couple of robustness gaps.

## Critical Issues

### CR-01: Release workflow cannot resolve a pnpm version — Setup pnpm step will fail

**File:** `.github/workflows/release.yml:35-36`
**Issue:** `pnpm/action-setup@v4` is used with no `version` input, and there is no
`packageManager` field and no `engines.pnpm`/`pnpm` field in the root `package.json`
(verified: no `packageManager` anywhere in the repo, and `pnpm-workspace.yaml` carries
no version pin). `pnpm/action-setup@v4` removed its bundled default and requires the
version to come from either the `version:` input or a `packageManager`/`engines.pnpm`
field; with neither present it errors ("No pnpm version is specified ...") and the job
fails before install. Because this is the only release path and runs on every push to
`main`, the very first publish attempt fails.
**Fix:** Pin pnpm explicitly. Either add to the workflow:
```yaml
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9
```
or (preferred, keeps local + CI in lockstep) add a `packageManager` field to the root
`package.json`, e.g. `"packageManager": "pnpm@9.15.0"`, matching the pnpm that produced
`pnpm-lock.yaml` (lockfileVersion 9.0).

### CR-02: Published tarball omits LICENSE and README despite MIT declaration

**File:** `packages/core/package.json:5,21`
**Issue:** `"license": "MIT"` is declared and `files: ["dist"]` restricts the tarball to
`dist/`, but the root `LICENSE` and `README.md` live at the repo root, not in
`packages/core/`. With `@semantic-release/npm` `pkgRoot: packages/core`, npm packs only
from `packages/core` — which contains neither file (verified: no `packages/core/LICENSE`,
no `packages/core/README.md`, no `prepack` script). The published package therefore ships
no license text (a real legal/compliance gap for an MIT package) and no README (blank npm
landing page). The 06-04 summary explicitly flagged this at D-02 sign-off as a follow-up
that "must land before the dev->main merge"; it has not landed in the reviewed tree.
**Fix:** Add a `prepack` (or `prepublishOnly`) script in `packages/core/package.json` that
copies the root files into the package dir before packing, and include them in `files`:
```jsonc
"files": ["dist", "LICENSE", "README.md"],
"scripts": {
  "prepack": "cp ../../LICENSE ../../README.md ."
}
```
Then add `packages/core/LICENSE` and `packages/core/README.md` to `.gitignore` if copied
at pack time. Confirm via `cd packages/core && npm publish --dry-run` that both files
appear in the tarball before the merge.

## Warnings

### WR-01: No concurrency guard on the release workflow — racing publishes

**File:** `.github/workflows/release.yml:22-25`
**Issue:** The `release` job has no top-level `concurrency` group. Two pushes to `main`
in quick succession (e.g., a squash-merge immediately followed by a hotfix) start two
concurrent `semantic-release` runs. Concurrent runs can race on tag creation, the
`@semantic-release/git` CHANGELOG re-commit, and the npm publish, producing failed/partial
releases or a non-fast-forward push rejection.
**Fix:** Add a concurrency group that serializes releases:
```yaml
concurrency:
  group: release
  cancel-in-progress: false
```

### WR-02: `[skip ci]` loop guard is provider-mismatched (relies on undocumented behavior)

**File:** `.releaserc.json:22` and `.github/workflows/release.yml:9-10`
**Issue:** The `@semantic-release/git` commit message uses `[skip ci]` as the recursion
guard. GitHub Actions does NOT honor `[skip ci]` for `push` events the way Travis/GitLab
do — `[skip ci]` only suppresses Actions runs for pushes/PRs in specific cases and is not
a contractual guard. The actual thing preventing the recursive re-trigger is that pushes
made with the default `GITHUB_TOKEN` do not trigger further workflow runs. That works, but
the configured guard is effectively a comment, not a mechanism — and if the maintainer
later swaps to a PAT (the governance doc mentions a "scoped release-token bypass actor"
for branch protection), the loop guard silently stops working and the release workflow
will recurse.
**Fix:** Make the guard explicit and provider-correct. Either rely documentedly on the
default token (and note that a PAT must keep `[skip ci]` handling), or add a defensive
job-level guard:
```yaml
jobs:
  release:
    if: ${{ !contains(github.event.head_commit.message, '[skip ci]') }}
```

### WR-03: commit-msg hook rejects uppercase scopes, violating Conventional Commits

**File:** `.githooks/commit-msg:32`
**Issue:** The scope character class is `[a-z0-9._-]+`, which rejects any uppercase
letter in the scope. Verified: `feat(API): ...` and `feat(SCOPE): ...` exit 1. The
Conventional Commits spec places no case restriction on scopes, and uppercase scopes
(`API`, `KV`, `OAuth`) are common and legitimate. This blocks valid local commits and
will frustrate maintainers; the corresponding CI `pr-title` check uses the upstream
amannn action, which does NOT enforce lowercase scope — so a PR title `feat(API): x`
passes CI but the same subject would be rejected by the local hook, an inconsistency.
**Fix:** Allow uppercase in the scope (or drop the case restriction entirely):
```bash
CC_REGEX='^(feat|fix|docs|refactor|test|chore|build|ci|perf|style)(\([A-Za-z0-9._/ -]+\))?(!)?: .+'
```
(Adjust to match the upstream action's `scopes`/`requireScope` config to keep local and
CI in lockstep.)

### WR-04: `set -u` does not actually protect against a missing message-file argument

**File:** `.githooks/commit-msg:18,21`
**Issue:** With `set -u`, an unbound `$1` would normally abort. But `$1` is referenced
inside a command substitution — `SUBJECT=$(head -1 "$1")` — so the unbound-variable
error fires in the subshell, which exits, while the parent shell continues with
`SUBJECT=""` and falls through to the generic rejection (verified: it prints
`line 21: $1: unbound variable` to stderr but does not abort; exit 1). For a nonexistent
file path it leaks a raw `head: ... No such file or directory` to stderr. Git always
passes the path so this is not a live failure, but the `set -u` guard gives a false sense
of safety and the error output is noisy/misleading.
**Fix:** Validate the argument explicitly before use:
```bash
if [[ -z "${1:-}" || ! -f "$1" ]]; then
  echo "commit-msg hook: missing or unreadable commit-message file" >&2
  exit 1
fi
SUBJECT=$(head -1 "$1")
```

### WR-05: dist-parity test silently passes on a stale build with no guard that a build ran

**File:** `packages/core/src/__tests__/dist-parity.test.ts:27-47`
**Issue:** The test asserts artifact existence on disk and dynamic-imports the built
`store/kv.js`, but nothing ties the assertions to a *fresh* build. If `dist/` is stale
(an old successful build) but the current `src/` no longer compiles, `pnpm test` run
without a preceding build passes green while shipping nothing new — the "parity" claim is
unverified. The header comment says it "requires the package to have been built first,"
but that ordering is unenforced: the `test` script (`vitest run`) does not depend on
`build`, and CI runs `build` then `semantic-release` (which runs `prepare`/tests
separately). A renamed source entry would only be caught if a build happened to run first.
**Fix:** Either gate the test on a freshly-built dist (e.g., run build in a Vitest
`globalSetup`, or make the `test` script `tsdown && vitest run`), or assert the artifact
mtime is newer than the newest `src/` file. At minimum, make CI run the test *after* the
build step (currently CI never runs the suite in `release.yml` at all — see IN-03).

## Info

### IN-01: commit-msg passthrough globs are over-broad prefix matches

**File:** `.githooks/commit-msg:25`
**Issue:** `Merge*|Revert*` match any subject *starting* with those words, so a legitimate
non-conventional subject like `Merged tenant configs` or `Reverts the cache` is silently
exempted (verified: both exit 0). Low impact since these aren't valid Conventional
subjects anyway, but the passthrough is wider than the intended git-generated set.
**Fix:** Tighten to git's actual generated forms, e.g. `Merge branch *|Merge pull request *|Merge remote-tracking *|Revert "*`.

### IN-02: commit-msg test has a no-op afterAll and never cleans the temp dir

**File:** `packages/core/src/__tests__/commit-msg.test.ts:29-31`
**Issue:** `afterAll` is registered but its body only contains a comment; the `mkdtempSync`
temp dir is never removed. The comment ("OS reclaims tmpdir regardless") is true but the
empty hook is dead code that reads as an oversight.
**Fix:** Either remove the empty `afterAll` or implement it: `rmSync(workDir, { recursive: true, force: true })`.

### IN-03: release.yml never runs the test suite before publishing

**File:** `.github/workflows/release.yml:47-54`
**Issue:** The release job installs, builds, then runs `semantic-release` — it never runs
`pnpm test`. The dist-parity and commit-msg tests (and the 110+ security/negative-case
tests that are the stated core value of this package) do not gate the publish. A broken
build that still emits files, or a regression in the bridge, could be published.
semantic-release's npm plugin runs `prepublishOnly`/`prepack` lifecycle scripts but not
`test` by default.
**Fix:** Add a test step before Release, or run it as part of the build gate:
```yaml
      - name: Build package
        run: pnpm --filter next-auth-bridge build
      - name: Test
        run: pnpm --filter next-auth-bridge test
```

### IN-04: pr-title.yml triggers on `synchronize` unnecessarily

**File:** `.github/workflows/pr-title.yml:10`
**Issue:** The PR-title check listens for `opened, edited, synchronize`. The PR *title*
cannot change on `synchronize` (new commits pushed) — only `opened`/`edited`/`reopened`
mutate the title. Including `synchronize` re-runs the check on every push for no behavioral
gain. Harmless, but wasteful and slightly misleading about intent. Note `reopened` is
absent, so re-opening a previously-edited PR will not re-validate.
**Fix:** Use `types: [opened, edited, reopened]`.

---

_Reviewed: 2026-06-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Resolution log (orchestrator, 2026-06-14)

Fixed inline during phase execution:

- **CR-01 — release.yml pnpm version unresolvable** — RESOLVED. Added
  `"packageManager": "pnpm@9.3.0"` to the root `package.json` so `pnpm/action-setup@v4`
  resolves the version. Commit `a174d60`. `pnpm install --frozen-lockfile` still clean.
- **WR-03 — commit-msg regex rejected uppercase/path scopes** — RESOLVED. Widened the
  scope class to `[A-Za-z0-9._/-]+`, aligning the hook with the CI pr-title check. Added
  two regression tests (uppercase scope, path-like scope). Commit `5eafe79`. Suite now 126
  tests green.

Deferred to follow-up (tracked, must land before the dev->main merge):

- **CR-02 — LICENSE/README absent from the published tarball** — covered by spawned
  follow-up task (add a `packages/core` prepack script copying root LICENSE + corrected
  README). Independently confirmed by this review.

Remaining warnings/info (WR-01, WR-02, WR-04, WR-05, IN-01..IN-04) are advisory and left
for maintainer discretion; none are security-exposure defects (the supply-chain hardening
was rated solid).
