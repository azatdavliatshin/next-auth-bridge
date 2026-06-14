# Maintainer dev → main workflow

The day-to-day loop for landing work from `dev` onto `main`, plus the sharp edges
that have actually bitten us. Pairs with [release-governance.md](./release-governance.md)
(the release pipeline) and the branch model in the root `CLAUDE.md`.

## Branch model

- **`dev`** — active engineering branch. Commit freely here: code *and* GSD
  `.planning/` artifacts.
- **`main`** — the published surface. PR-only, protected by a ruleset that
  **requires linear history** (so merge commits are blocked — use squash or rebase).
  Each push to `main` triggers semantic-release.

We land `dev → main` with **rebase-merge** (not squash). Rebasing keeps `dev`'s
real atomic commits on `main` and preserves shared ancestry, which keeps
`main..dev` to only the genuinely-new commits. (Squash-merging detaches history:
`main..dev` then reports the *entire* branch every time, which makes
`/gsd-pr-branch`'s cherry-pick replay the whole project and conflict. Rebase
avoids that trap.)

## The loop

```bash
# 1. Work on dev — commit code + .planning/ freely, Conventional-Commit messages.

# 2. When a chunk is ready, build a clean PR branch (strips transient .planning/).
/gsd-pr-branch
#    → creates dev-<slug>-pr off main, .planning/ phases/quick/etc. removed,
#      the 5 structural planning files (STATE/ROADMAP/PROJECT/REQUIREMENTS/config)
#      left unchanged.

# 3. Push + open the PR. Title MUST be a Conventional Commit (the `validate` check).
git push -u origin dev-<slug>-pr
gh pr create --base main --title "feat(scope): ..." --body "..."

# 4. Merge with REBASE (linear-history requirement) + admin (PR-only ruleset bypass).
gh pr merge <n> --rebase --admin --delete-branch

# 5. Reconcile dev with the release commit semantic-release pushed to main.
git checkout dev
git merge origin/main          # picks up chore(release): X.Y.Z + the tag
git push origin dev
```

## Why each non-obvious flag

- **`--rebase`** — `main` requires linear history; merge commits are rejected.
  Rebase replays your commits, so semantic-release reads each Conventional-Commit
  message on `main` (every commit on the PR branch must therefore be well-formed —
  which `/gsd-pr-branch` preserves; don't hand-squash).
- **`--admin`** — the ruleset is PR-only with **no required approvals**; the owner
  is the bypass actor. `--admin` merges once checks are green without a second
  reviewer. (Plain `gh pr merge` returns "base branch policy prohibits the merge"
  even when mergeable — that's the ruleset, not a real blocker.)
- **Step 5** — semantic-release commits `chore(release): X.Y.Z [skip ci]` back to
  `main`; merging it into `dev` keeps the version/CHANGELOG in sync and avoids drift.

## Releasing

Automatic on push to `main` (see [release-governance.md](./release-governance.md)):
`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` footer → major. Publishes to
npm via OIDC Trusted Publishing with a Sigstore provenance attestation, tags, and
cuts a GitHub Release.

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

## External contributors

Fork, branch from `main`, open a PR against `main`. They never touch `dev` or the
`/gsd-pr-branch` step — that's maintainer-only tooling for filtering planning
artifacts.
