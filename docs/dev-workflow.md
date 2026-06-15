# Maintainer workflow (trunk-based)

The day-to-day loop for landing work on `main`, plus the sharp edges that have
actually bitten us. Pairs with [release-governance.md](./release-governance.md)
(the release pipeline) and the branch model in the root `CLAUDE.md`.

## Branch model

Trunk-based (GitHub Flow). One long-lived branch:

- **`main`** — the trunk and the release surface. PR-only, protected by a ruleset
  that **requires linear history** (merge commits are blocked — rebase or squash).
  Each push to `main` triggers semantic-release.

There is no `dev` branch. GSD `.planning/` artifacts live in the tree on `main`
like any other internal docs — they never reach the published npm package (it
ships only `packages/core/dist`, per the `files` allowlist in
`packages/core/package.json`), so they cost nothing on the trunk and keep the
project's decision history in one place.

We land PRs with **rebase-merge** (not squash). Rebasing keeps each atomic
Conventional-Commit subject on `main` so semantic-release can parse every one of
them. (Squash collapses a multi-commit PR into a single subject, which loses the
per-commit `feat:`/`fix:` signal semantic-release reads.)

## The loop

```bash
# 1. Branch a short-lived branch off main. Conventional-Commit messages.
git checkout main && git pull
git checkout -b feat/<slug>

# 2. Work — commit code AND any .planning/ artifacts freely; both belong on main.

# 3. Push + open the PR. Title MUST be a Conventional Commit (the `validate` check).
git push -u origin feat/<slug>
gh pr create --base main --title "feat(scope): ..." --body "..."

# 4. Merge with REBASE (linear-history requirement) + admin (PR-only ruleset bypass).
gh pr merge <n> --rebase --admin --delete-branch

# 5. Sync local main with the release commit semantic-release pushed.
git checkout main && git pull   # picks up chore(release): X.Y.Z + the tag
```

## Why each non-obvious flag

- **`--rebase`** — `main` requires linear history; merge commits are rejected.
  Rebase replays your commits, so semantic-release reads each Conventional-Commit
  message on `main` (every commit on the branch must therefore be well-formed —
  the local commit-msg hook enforces this; don't hand-squash unrelated work).
- **`--admin`** — the ruleset is PR-only with **no required approvals**; the owner
  is the bypass actor. `--admin` merges once checks are green without a second
  reviewer. (Plain `gh pr merge` returns "base branch policy prohibits the merge"
  even when mergeable — that's the ruleset, not a real blocker.)
- **Step 5** — semantic-release commits `chore(release): X.Y.Z [skip ci]` back to
  `main`; pull it so your local trunk has the version/CHANGELOG bump and the tag.

## Releasing

Automatic on push to `main` (see [release-governance.md](./release-governance.md)):
`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` footer → major. Publishes to
npm via OIDC Trusted Publishing with a Sigstore provenance attestation, tags, and
cuts a GitHub Release. `docs:`/`chore:`/`test:`/`ci:`/`refactor:` commits cut no
release (so planning churn on the trunk never bumps the version).

## Gotchas (each one cost real time at least once)

1. **Don't direct-push to `main`** — even an owner bypass push does **not** fire
   `push` workflows, so the release won't run. Always go through the PR merge.
2. **Never let a `[skip ci]` string reach a `main` commit body** unless you mean it.
   semantic-release's own release commit uses `[skip ci]` deliberately (to avoid a
   loop). But if *you* revert that commit, the revert's subject quotes
   `[skip ci]` → GitHub suppresses ALL workflows for that push. Reword such commits.
3. **If a release gets stuck**, re-run it against current `main` without crafting a
   commit — `release.yml` has a `workflow_dispatch` trigger:
   ```bash
   gh workflow run release.yml --ref main
   ```
4. **Split-brain recovery** (tag + CHANGELOG landed but npm publish failed):
   ```bash
   git push origin :refs/tags/vX.Y.Z          # delete the tag
   # revert the chore(release): X.Y.Z commit on main (resets version + CHANGELOG)
   # fix the workflow, then:
   gh workflow run release.yml --ref main     # semantic-release re-cuts cleanly
   ```
5. **npm version floor for OIDC** — Node 22.14 bundles npm 10.9.2, below the 11.5.1
   OIDC publish floor; `release.yml` upgrades npm explicitly. Don't assume a Node
   version ships a recent enough npm. (Full detail in release-governance.md.)
6. **Required status-check name** — the `main` ruleset's required check is the
   GitHub Actions **job** name (`validate`), NOT `workflow / job` (`pr-title /
   validate`). The `workflow / job` form never reports for Actions check-runs, so a
   PR sits at "Expected — Waiting for status to be reported" / BLOCKED forever even
   though every check passed. If you re-create the ruleset, the required context is
   `validate`.

## Contributors

Everyone — maintainer and external contributor — uses the same flow: fork (if
external), branch a short-lived branch off `main`, open a PR against `main`. There
is no separate maintainer track and no planning-artifact filtering step.
