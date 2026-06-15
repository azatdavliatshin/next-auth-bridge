# Phase 6: Release Engineering - Research

**Researched:** 2026-06-12
**Domain:** npm release automation (semantic-release), supply-chain provenance, commit governance, bundler migration (tsup → tsdown), GitHub branch protection, Auth.js docs contribution
**Confidence:** HIGH

## Summary

This phase wires the automated release pipeline for `next-auth-bridge` and locks down the
published surface. The standard, currently-maintained stack is **semantic-release 25** driven by
the conventional-default plugin chain (`commit-analyzer` → `release-notes-generator` →
`changelog` → `npm` → `git` → `github`), publishing to npm with **Sigstore provenance** (signed
source→tarball attestation) on merge to `main`. Commit governance is split into two halves that
together close the gap: a hand-rolled `.githooks/commit-msg` (matching the repo's existing
no-dependency hook convention) for the maintainer's local commits, and a CI **PR-title check**
(`amannn/action-semantic-pull-request@v6`) that validates the squash-merge subject —
which is the exact string semantic-release parses. The carried-in **tsup → tsdown** migration
is driven by the official `tsdown-migrate` tool; tsdown's ESM/dts defaults map cleanly onto the
existing two-entry config.

The one non-obvious constraint surfaced by version verification: **semantic-release 25 and
tsdown 0.22 both require Node ≥ 22** as a *dev/CI-tooling* floor, which is entirely separate from
the package's *consumer* `engines.node >= 18` floor (D-03). The publish workflow runner and the
maintainer's local toolchain must be on Node 22+, but the published package can still declare a
≥18 consumer floor. Do not let the tooling floor leak into `engines`.

**Primary recommendation:** Use semantic-release 25 with the conventional six-plugin chain in a
root `.releaserc.json`, publish with `provenance: true` + `id-token: write` on a Node-22 GitHub
runner, gate the first live publish behind a human-inspected `npm publish --dry-run` (D-02),
migrate to tsdown via `npx tsdown-migrate` then verify dist-parity against the known-good tsup
output, and add `amannn/action-semantic-pull-request@v6` for the squash-subject guard.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — ESM-only for v0.1.0.** Do NOT add CJS now. Package is already ESM-only; dual format
  would double build outputs and the exports-resolution matrix for no proven need. CJS is a
  non-breaking additive change available later. (Rejected: dual ESM+CJS now.)
- **D-02 — Dry-run / pack-inspection gate before the first irreversible real publish.** Fill all
  metadata, then run `npm publish --dry-run` (or `pnpm pack` + inspect tarball) to confirm exactly
  what ships (correct `dist/` emit, `./store/kv` subpath present, no stray files). semantic-release's
  own dry-run validates version derivation. A human verifies the first tarball before the pipeline
  goes live. This step is deliberate, visible, and human-signed-off — NOT buried in CI.
- **D-03 — Full publish hygiene.** `files: ["dist"]` allowlist (LICENSE + README auto-included by
  npm; src/tests/configs excluded); `publishConfig.access: "public"` + `provenance: true` (workflow
  needs `id-token: write`); `engines.node >= 18`; `repository`/`homepage`/`bugs` →
  `github.com/azatdavliatshin/next-auth-bridge`; `keywords` for discoverability. Slimmest
  trustworthy tarball with a verifiable supply-chain attestation. (Rejected: standard metadata
  without provenance.)
- **D-04 — Hand-rolled `.githooks/commit-msg`** validating Conventional-Commits format with regex,
  matching the existing `.githooks/pre-commit` convention (same `core.hooksPath .githooks`
  activation, no husky, zero runtime devDeps). (Rejected: commitlint + husky.)
- **D-05 — CI PR-title Conventional-Commits check.** Lightweight GitHub Actions check validating
  the PR title (squash-merge default subject = what semantic-release parses on merge to `main`).
  Closes the gap the local hook structurally cannot cover (external contributors, fat-fingered
  merge subjects). (Rejected: local hook only / maintainer discipline.)
- **D-06 — Migrate tsup → tsdown now, explicitly accepting tsdown's pre-1.0 (0.x) state.** The ≥1.0
  gate is met for the *engine* (Rolldown 1.0 stable, May 2026) not tsdown itself. Mitigated by the
  stable Rolldown engine + the D-02 dry-run/pack gate verifying emitted `dist/` and `./store/kv`
  resolution. Isolated change: build config + build script + devDep. (Rejected: defer to post-≥1.0.)

### Claude's Discretion

- Exact semantic-release plugin set + config shape, and where config lives (root vs `packages/core`,
  `.releaserc` vs `release.config.js`).
- Precise `keywords` list, exact `engines.node` floor value (≥18 is the intent), exact
  `repository`/`homepage`/`bugs` URL forms.
- Exact regex/matcher in `.githooks/commit-msg` and which Conventional-Commits types it permits
  (must at least cover the CLAUDE.md set: feat, fix, docs, refactor, test, chore, build, ci, perf,
  style, plus the `BREAKING CHANGE:` footer).
- Whether tsdown migration uses pinned-exact version + dist-parity check (D-06's considered tactic)
  or relies solely on the D-02 dry-run gate.
- Exact branch-protection rule set on `main` (required checks, no-direct-push, PR-required) —
  configured GitHub-side; documented in the phase, applied by the maintainer.
- Auth.js docs recipe content/structure and exact authjs.dev contribution path.
- Whether root `package.json` (currently empty) gains workspace-root release scripts or release
  config lives entirely under `packages/core`.

### Deferred Ideas (OUT OF SCOPE)

- Dual ESM+CJS output (revisit v0.1.x/v0.2 only if a real consumer needs CJS — D-01).
- Pinned-exact tsdown + automated dist-parity assertion as a *standing* CI check (one-time guard at
  most — D-06).
- Real enterprise-host validation (SharePoint/Teams Tab) as a post-publish soak item.
- `next-auth-bridge/react` subpath shipping a ready-made `/auth/popup` (forward-compat, not v0.1).
- Minimal popup-only example (EXAMPLE-05) and Upstash adapter (roadmap-deferred).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RELEASE-01 | semantic-release: Conventional-Commits-driven version, tag, npm publish, CHANGELOG, GitHub Release on merge to `main` | Standard Stack → semantic-release 25 + six-plugin chain; Code Examples → `.releaserc.json` |
| RELEASE-02 | GitHub Actions workflow publishing `next-auth-bridge` to npm on merge to `main` via `NPM_TOKEN` | Code Examples → publish workflow with `id-token: write`, Node 22 runner, provenance |
| RELEASE-03 | Local `commit-msg` hook rejecting non-Conventional-Commits before push + CI PR-title guard | Code Examples → `.githooks/commit-msg` regex; `amannn/action-semantic-pull-request@v6` workflow |
| RELEASE-04 | MIT via root LICENSE + `package.json` (no per-file headers); branch protection on `main` | License half already satisfied; branch-protection ruleset via `gh api` (Code Examples) |
| RELEASE-05 | Auth.js docs recipe PR against authjs.dev | Architecture → recipe lives at `docs/pages/guides/<slug>.mdx` + `_meta.js` registration in `nextauthjs/next-auth` |
| (carried-in) | Build-tooling migration tsup → tsdown, ESM-only publish surface | Standard Stack → tsdown 0.22.2 / Rolldown 1.1.1; Code Examples → `tsdown.config.ts` + `npx tsdown-migrate` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No emoji in code or commit messages** (OK in README headings). The recipe `.mdx` and workflows
  must not embed emoji in code/commit context.
- **License declared once** via root `LICENSE` + `package.json` `"license": "MIT"`. **Do NOT add
  per-file SPDX/copyright headers.** This overrides RELEASE-04's literal "MIT license headers"
  wording — declaration-once is the locked stance.
- **No internal requirement IDs in shipped source** (Phase 5 discreet mandate). Config files,
  workflows, hooks, and the Auth.js recipe ship publicly — keep them self-documenting with **no**
  `RELEASE-NN` / `D-NN` / `THREAT-NN` markers in committed source or comments.
- **Conventional Commits enforced** by commit-msg hook + commit-msg validation. Types: feat, fix,
  docs, refactor, test, chore, build, ci, perf, style + `BREAKING CHANGE:` footer.
- **Functional style, no classes** — any helper scripts stay lean and dependency-minimal.
- **`main` is PR-only, branch-protected**; PRs squash-merged; semantic-release runs on merge to `main`.
- **Threat-model discipline** — release tooling should NOT touch bridge/consume/cookie/detection
  logic. If it does, threat-model.md + negative-test discipline applies. (It should not here.)

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Version derivation from commits | CI (GitHub Actions) | — | semantic-release runs in CI on merge to `main`; deterministic from git history |
| npm publish + provenance attestation | CI (GitHub-hosted runner) | npm registry | Sigstore OIDC requires GitHub-hosted runner identity (`id-token: write`); cannot be local |
| Tarball content correctness | Build (tsdown) | Human (D-02 gate) | Build emits `dist/`; human inspects first tarball before pipeline goes live |
| Local commit-message validation | Git hook (local) | — | `commit-msg` runs client-side; only covers maintainer with hooks activated |
| Squash-merge subject validation | CI (PR check) | — | The merge subject is server-side state; only CI can guard it on the PR |
| Branch protection / no-direct-push | GitHub repo settings | — | Enforced by GitHub server-side ruleset, not by any repo file |
| Docs-recipe discovery surface | External repo (authjs.dev) | — | Lives in `nextauthjs/next-auth` docs workspace, not this repo |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `semantic-release` | 25.0.5 | Orchestrates version derivation, tag, publish, changelog, GitHub Release | The de-facto Conventional-Commits release tool; named in CLAUDE.md as the project's release mechanism [VERIFIED: npm registry] |
| `@semantic-release/commit-analyzer` | 13.0.1 | Maps commit types → semver bump (feat→minor, fix→patch, BREAKING→major) | Default plugin; implements the exact rule CLAUDE.md describes [VERIFIED: npm registry] [CITED: semantic-release.gitbook.io/usage/configuration] |
| `@semantic-release/release-notes-generator` | 14.1.1 | Generates release notes from commits | Default plugin [VERIFIED: npm registry] |
| `@semantic-release/npm` | 13.1.5 | Publishes to npm (honors `publishConfig`, `--provenance`) | Default plugin; the publish step [VERIFIED: npm registry] |
| `@semantic-release/github` | 12.0.8 | Creates the GitHub Release + uploads notes | Default plugin [VERIFIED: npm registry] |
| `tsdown` | 0.22.2 | ESM+dts bundler (Rolldown-backed); replaces tsup | D-06 migration target; tsup-compatible config + official migration tool [VERIFIED: npm registry] [CITED: tsdown.dev/guide/migrate-from-tsup] |
| `rolldown` | 1.1.1 | Rust bundler engine underneath tsdown (transitive) | The stable ≥1.0 engine that satisfies D-06's engine gate [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@semantic-release/changelog` | 6.0.3 | Writes/updates `CHANGELOG.md` from release notes | RELEASE-01 explicitly requires a CHANGELOG entry — add to plugin chain [VERIFIED: npm registry] |
| `@semantic-release/git` | 10.0.1 | Commits the updated `CHANGELOG.md` + version back to the repo | Pairs with `changelog` to persist the changelog into `main` [VERIFIED: npm registry] |
| `tsdown-migrate` | 0.22.2 | One-shot tsup→tsdown config migrator (`npx tsdown-migrate`, `--dry-run`) | Run once during D-06 migration; versioned in lockstep with tsdown [VERIFIED: npm registry] [CITED: tsdown.dev/guide/migrate-from-tsup] |
| `amannn/action-semantic-pull-request` | v6.1.1 | CI check validating PR title matches Conventional Commits | D-05 squash-subject guard; used by Vite/Vercel/Electron [VERIFIED: GitHub releases API] [CITED: github.com/amannn/action-semantic-pull-request] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@semantic-release/changelog` + `git` | Skip changelog persistence (GitHub Release only) | RELEASE-01 explicitly names CHANGELOG — keep both. The `git` plugin re-commits to `main`, which interacts with branch protection (see Pitfall 4) |
| `amannn/action-semantic-pull-request` | Hand-rolled PR-title regex in a workflow step | Hand-rolled keeps zero third-party actions but loses the maintained allowed-types/scope/breaking-`!` handling. Both viable; the action is the lower-maintenance default. Pin to a full SHA or `@v6` |
| tsdown | Stay on tsup 8.x | D-06 locks the migration; tsup stays only if migration regresses dist-parity |
| `.releaserc.json` (root) | `release.config.js` in `packages/core` | JSON is declarative/lint-free; root keeps release orchestration above the workspace. Either honors D-03 discretion |

**Installation:**
```bash
# dev dependencies (NOTE: root package.json currently lists these as `dependencies` — move to devDependencies)
pnpm add -D -w semantic-release @semantic-release/commit-analyzer \
  @semantic-release/release-notes-generator @semantic-release/changelog \
  @semantic-release/npm @semantic-release/git @semantic-release/github
# in packages/core: replace tsup with tsdown
pnpm --filter next-auth-bridge remove tsup
pnpm --filter next-auth-bridge add -D tsdown
```

**Version verification (run at implementation time — versions move fast):**
```bash
npm view tsdown version          # was 0.22.2, published 2026-06-10
npm view rolldown version        # was 1.1.1
npm view semantic-release version # was 25.0.5
gh api repos/amannn/action-semantic-pull-request/releases/latest --jq .tag_name  # was v6.1.1
```

## Package Legitimacy Audit

slopcheck 0.6.1 was available; `slopcheck scan` run against a manifest of all release-tooling
packages — **all 9 returned `[OK]`**. tsdown has no `postinstall` script (verified via
`npm view tsdown scripts.postinstall` → empty).

| Package | Registry | Age / Note | Downloads (last wk) | Source Repo | slopcheck | Disposition |
|---------|----------|-----------|---------------------|-------------|-----------|-------------|
| semantic-release | npm | mature (v25) | 2.21M | github.com/semantic-release/semantic-release | [OK] | Approved |
| @semantic-release/commit-analyzer | npm | mature | (bundled use) | semantic-release org | [OK] | Approved |
| @semantic-release/release-notes-generator | npm | mature | (bundled use) | semantic-release org | [OK] | Approved |
| @semantic-release/changelog | npm | mature | (bundled use) | semantic-release org | [OK] | Approved |
| @semantic-release/npm | npm | mature | (bundled use) | semantic-release org | [OK] | Approved |
| @semantic-release/git | npm | mature | (bundled use) | semantic-release org | [OK] | Approved |
| @semantic-release/github | npm | mature | (bundled use) | semantic-release org | [OK] | Approved |
| tsdown | npm | 0.x, v0.22.2 pub 2026-06-10 | 1.95M | github.com/rolldown/tsdown | [OK] | Approved (no postinstall) |
| rolldown | npm | v1.1.1 (stable ≥1.0) | 45.2M | github.com/rolldown/rolldown | [OK] | Approved |
| tsdown-migrate | npm | 0.22.2 (lockstep w/ tsdown) | — | github.com/rolldown/tsdown | not scanned individually | Approved — same org/repo as tsdown; run via `npx` once, verify before |
| amannn/action-semantic-pull-request | GitHub Action (not npm) | v6.1.1 | n/a | github.com/amannn/action-semantic-pull-request | n/a | Approved — pin to `@v6` or full commit SHA |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
  Maintainer commits on `dev`
        │  (git commit)
        ▼
  .githooks/commit-msg ──reject──▶ malformed message blocked locally (D-04)
        │ pass
        ▼
  PR `dev`-filtered branch ──▶ `main`
        │
        ├─▶ CI: amannn/action-semantic-pull-request ──fail──▶ PR blocked (D-05)
        │       (validates squash-merge SUBJECT = Conventional Commits)
        │
        ▼ (squash-merge to main — branch protection: PR-only, required checks)
  GitHub Actions: release workflow (Node 22 runner, id-token: write)
        │
        ▼
  semantic-release
        ├─ commit-analyzer ........ derive next version from commits since last tag
        ├─ release-notes-generator  build notes
        ├─ changelog .............. write CHANGELOG.md
        ├─ npm ('--provenance') ... publish next-auth-bridge → npm registry
        │                            (Sigstore signs source→tarball attestation)
        ├─ git .................... commit CHANGELOG.md + tag back to main
        └─ github ................. create GitHub Release + tag

  ── BEFORE first live run (D-02 human gate) ──
  npm publish --dry-run / pnpm pack ──▶ human inspects tarball:
        dist/index.{js,d.ts}, dist/store/kv.{js,d.ts}, no stray src/tests
```

### Component Responsibilities
| File / location | Responsibility |
|-----------------|----------------|
| `.releaserc.json` (root, discretion) | semantic-release plugin chain + branches config (RELEASE-01) |
| `.github/workflows/release.yml` (NEW) | Trigger on push to `main`; Node 22; `id-token: write`; run semantic-release (RELEASE-02) |
| `.github/workflows/pr-title.yml` (NEW) | `amannn/action-semantic-pull-request@v6` on `pull_request` target `main` (RELEASE-03/D-05) |
| `.githooks/commit-msg` (NEW) | Bash regex validating Conventional-Commits subject (RELEASE-03/D-04) |
| `packages/core/tsdown.config.ts` (replaces `tsup.config.ts`) | Two-entry ESM+dts build (D-06) |
| `packages/core/package.json` | Publish metadata (D-03) + `build` script → tsdown |
| GitHub repo settings (no file) | Branch-protection ruleset on `main` (RELEASE-04) — document the `gh api` recipe in-repo |
| `nextauthjs/next-auth` `docs/pages/guides/<slug>.mdx` + `_meta.js` | External recipe PR (RELEASE-05) |

### Pattern 1: Root `.releaserc.json` with explicit plugin order
**What:** Declarative JSON config at repo root listing the six plugins in run order.
**When to use:** RELEASE-01. JSON is lint-free and keeps orchestration above the workspace.
**Example:**
```json
// Source: semantic-release.gitbook.io/usage/configuration (plugin order + branches)
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { "changelogFile": "CHANGELOG.md" }],
    ["@semantic-release/npm", { "pkgRoot": "packages/core" }],
    ["@semantic-release/git", {
      "assets": ["CHANGELOG.md", "packages/core/package.json"],
      "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
    }],
    "@semantic-release/github"
  ]
}
```
Note `pkgRoot: "packages/core"` — the publishable package lives in the workspace, not at root.
Plugin order matters: analyzer → notes → changelog → npm → git → github. [CITED: semantic-release.gitbook.io/usage/configuration]

### Pattern 2: Publish workflow with provenance
**What:** GitHub Actions job on a GitHub-hosted Node-22 runner with `id-token: write`.
**When to use:** RELEASE-02 + D-03 provenance.
**Example:**
```yaml
# Source: docs.npmjs.com/generating-provenance-statements
name: Release
on:
  push:
    branches: [main]
permissions:
  contents: write      # @semantic-release/git pushes CHANGELOG + tag
  issues: write
  pull-requests: write
  id-token: write      # REQUIRED for Sigstore provenance attestation
jobs:
  release:
    runs-on: ubuntu-latest   # GitHub-hosted runner required for provenance
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }     # full history for version derivation
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, registry-url: https://registry.npmjs.org }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter next-auth-bridge build
      - run: pnpm exec semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"
```
`provenance` can also be set via `publishConfig.provenance: true` in `package.json` (D-03) —
equivalent to `NPM_CONFIG_PROVENANCE=true`. [CITED: docs.npmjs.com/generating-provenance-statements]

### Pattern 3: PR-title check
```yaml
# Source: github.com/amannn/action-semantic-pull-request
name: PR Title
on:
  pull_request_target:
    types: [opened, edited, synchronize]
permissions:
  pull-requests: read
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v6   # or pin full SHA
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
        with:
          types: |
            feat
            fix
            docs
            refactor
            test
            chore
            build
            ci
            perf
            style
```
Breaking changes use `!` in the title (e.g. `feat!: …`) since titles are single-line.
[CITED: github.com/amannn/action-semantic-pull-request]

### Pattern 4: `.githooks/commit-msg` (hand-rolled, matches existing `pre-commit`)
```bash
#!/usr/bin/env bash
# Validate the commit message subject against Conventional Commits.
# Activate once per clone: git config core.hooksPath .githooks
set -uo pipefail
MSG_FILE="$1"
SUBJECT="$(head -1 "$MSG_FILE")"
# allow merge/revert/fixup subjects to pass through
case "$SUBJECT" in
  Merge*|Revert*|fixup!*|squash!*) exit 0 ;;
esac
PATTERN='^(feat|fix|docs|refactor|test|chore|build|ci|perf|style)(\([a-z0-9._-]+\))?(!)?: .+'
if ! printf '%s' "$SUBJECT" | grep -Eq "$PATTERN"; then
  echo "commit-msg: subject is not a Conventional Commit."
  echo "Expected: <type>[(scope)][!]: <description>"
  echo "Types: feat fix docs refactor test chore build ci perf style"
  exit 1
fi
exit 0
```
The `BREAKING CHANGE:` footer lives in the body (multi-line) — semantic-release detects it there;
the subject regex only needs the `!` shorthand. Mirror the existing `pre-commit` header/style.

### Anti-Patterns to Avoid
- **Letting the CI/tooling Node floor leak into `engines.node`.** semantic-release 25 needs Node
  `^22.14 || >=24.10`; tsdown 0.22 needs `^22.18 || >=24`. These are *runner/dev* requirements.
  The *consumer* `engines.node` stays `>=18` (D-03). Pin the CI runner to Node 22, not the package field.
- **Emoji or `RELEASE-NN`/`D-NN` markers in any shipped file** (CLAUDE.md). Workflows, hooks, config,
  and the recipe all ship publicly — keep them self-documenting with no internal IDs.
- **Self-hosted/local runner for the publish job.** Provenance requires a GitHub-hosted runner;
  Sigstore OIDC won't mint a token otherwise. [CITED: docs.npmjs.com]
- **`@semantic-release/git` fighting branch protection.** The git plugin pushes a release commit
  back to `main`. See Pitfall 4.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Version bump from commit history | Custom commit parser | `@semantic-release/commit-analyzer` | Conventional-Commits parsing, pre-release channels, BREAKING detection are subtle |
| Source→tarball signing | Manual signature step | npm `--provenance` (Sigstore) | Sigstore OIDC + transparency-log integration is not hand-rollable |
| tsup→tsdown config translation | Manual option-by-option rewrite | `npx tsdown-migrate` | Handles renamed/deprecated/unsupported options automatically [CITED: tsdown.dev] |
| Changelog generation | Hand-edited CHANGELOG.md | `@semantic-release/changelog` + `git` | Keeps changelog deterministic from commits, re-commits atomically |
| Branch protection logic | Workflow gate emulating protection | GitHub ruleset (server-side) | Only GitHub-side rules actually block direct pushes |

**Key insight:** The release domain is a solved, standardized pipeline. The only *bespoke* pieces
here are the lean hand-rolled `commit-msg` hook (D-04, deliberately no-dependency to match the
repo) and the human D-02 tarball-inspection gate — everything else is configuration of
battle-tested plugins.

## Runtime State Inventory

> This phase is largely greenfield tooling (new config/workflows/hooks) but the tsup→tsdown swap and
> the npm publish have real out-of-repo state. Inventory below.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore touched by release tooling. (Verified: phase scope is config/CI/build only.) | none |
| Live service config | (1) **npm registry**: package name `next-auth-bridge` must be unclaimed/owned by the maintainer before first publish — verify `npm view next-auth-bridge` ownership. (2) **GitHub repo settings**: branch-protection ruleset on `main` lives in repo settings, NOT in any file (RELEASE-04). (3) **GitHub Actions secrets**: `NPM_TOKEN` must be created in repo secrets (automation token with publish scope). | Verify npm name ownership; configure branch protection via `gh api`; add `NPM_TOKEN` secret |
| OS-registered state | **`.githooks` activation is per-clone**: `git config core.hooksPath .githooks` must be run locally; the new `commit-msg` hook is inert until then (same as existing `pre-commit`). Not auto-applied on clone. | Document activation; external contributors won't have it (D-05 CI check covers them) |
| Secrets/env vars | `NPM_TOKEN` (new repo secret), `GITHUB_TOKEN` (auto-provided by Actions). `NPM_CONFIG_PROVENANCE` is set inline in the workflow, not a secret. | Create `NPM_TOKEN`; nothing for `GITHUB_TOKEN` |
| Build artifacts | **tsup → tsdown swap**: existing `packages/core/dist/` from tsup must be rebuilt by tsdown and dist-parity verified (D-02/D-06). Old `tsup.config.ts` is replaced by `tsdown.config.ts`. Root `package.json` currently lists `tsdown` + `semantic-release` as **`dependencies`** (should be `devDependencies`) and `packages/core` still has `tsup` in devDeps + `"build": "tsup"`. | Rebuild + compare dist; remove tsup; fix root dep classification; switch build script |

**The canonical question — after every repo file is updated, what runtime state still carries old config?**
The npm registry (first publish is irreversible per version — D-02 gate), GitHub branch-protection
settings (server-side, not a file), and the per-clone hook activation. All three are addressed above.

## Common Pitfalls

### Pitfall 1: Tooling Node floor mistaken for consumer floor
**What goes wrong:** Setting `engines.node` to match semantic-release/tsdown (≥22) when D-03 says ≥18.
**Why it happens:** `npm view` shows tooling requires Node 22; tempting to mirror it.
**How to avoid:** Keep `engines.node >= 18` for consumers (D-03); pin the *CI runner* and *dev
toolchain* to Node 22. They are independent.
**Warning signs:** `engines.node` set to 22 in the published `package.json`.

### Pitfall 2: Missing `id-token: write` → provenance silently unavailable
**What goes wrong:** Publish succeeds but without an attestation; supply-chain guarantee (D-03) lost.
**Why it happens:** Default workflow permissions don't include `id-token`.
**How to avoid:** Add `permissions: id-token: write` at workflow or job level; verify with
`npm audit signatures` after first publish.
**Warning signs:** npm package page shows no "Provenance" badge.

### Pitfall 3: First tarball ships `src/`, tests, or misses `./store/kv`
**What goes wrong:** Without `files: ["dist"]` the tarball includes source/tests; or the tsdown swap
fails to emit `dist/store/kv.{js,d.ts}` and the subpath export 404s for consumers.
**Why it happens:** Default npm packing includes everything not ignored; bundler entry config drift.
**How to avoid:** D-02 — `npm publish --dry-run` / `pnpm pack` and inspect the tarball *before* live
publish; confirm `dist/index.{js,d.ts}` + `dist/store/kv.{js,d.ts}` present, no `src/`.
**Warning signs:** `npm pack --dry-run` file list contains `src/` or omits `store/kv`.

### Pitfall 4: `@semantic-release/git` blocked by branch protection
**What goes wrong:** The release commit (CHANGELOG + tag) can't push to a protected `main` that
requires PRs/status checks for everyone.
**Why it happens:** Branch protection (RELEASE-04) blocks direct pushes — including the bot's.
**How to avoid:** Either (a) allow the release workflow / `GITHUB_TOKEN` to bypass protection (a
ruleset bypass actor), or (b) drop `@semantic-release/git` and skip changelog re-commit, letting
the GitHub Release hold the notes. Decide explicitly during planning. The `[skip ci]` in the commit
message prevents a release loop.
**Warning signs:** Release job fails at the `git push` step with a protected-branch error.

### Pitfall 5: PR-title check uses `pull_request` not `pull_request_target`
**What goes wrong:** Fork PRs get a read-only `GITHUB_TOKEN`; the check may behave inconsistently.
**Why it happens:** Token scope differs between the two triggers.
**How to avoid:** Use `pull_request_target` with only `pull-requests: read`. Do NOT check out or run
untrusted PR code under `pull_request_target` (the check only reads the title — safe).
**Warning signs:** Check fails on external contributor PRs only.

## Code Examples

### tsdown config (replaces `tsup.config.ts`, same two-entry ESM+dts shape — D-06)
```typescript
// Source: tsdown.dev/guide/migrate-from-tsup (esm + dts + clean are tsdown defaults)
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "store/kv": "src/transfer-store/kv.ts",
  },
  format: ["esm"],   // tsdown defaults to esm; explicit keeps intent clear
  dts: true,         // auto-enabled when package.json has "types"; explicit is fine
  clean: true,       // tsdown default
});
```
Migrate with: `npx tsdown-migrate --dry-run` (preview) then `npx tsdown-migrate` (apply). The tool
converts renamed options (e.g. `cjsInterop` → `cjsDefault`) and flags unsupported ones. Verify
dist-parity against the known-good tsup output afterward (D-06 considered tactic). [CITED: tsdown.dev]

### Publish-metadata additions to `packages/core/package.json` (D-03)
```jsonc
{
  "files": ["dist"],
  "publishConfig": { "access": "public", "provenance": true },
  "engines": { "node": ">=18" },          // consumer floor — NOT the tooling floor
  "repository": { "type": "git", "url": "git+https://github.com/azatdavliatshin/next-auth-bridge.git" },
  "homepage": "https://github.com/azatdavliatshin/next-auth-bridge#readme",
  "bugs": { "url": "https://github.com/azatdavliatshin/next-auth-bridge/issues" },
  "keywords": ["auth.js", "next-auth", "nextjs", "authentication", "iframe",
               "chips", "partitioned-cookies", "pwa", "passkeys", "oauth"],
  "scripts": { "build": "tsdown" }        // was "tsup"
}
```
(URLs/keywords/exact engines value are Claude's discretion within D-03.) `repository.url` must
match the publishing source case-sensitively for provenance. [CITED: docs.npmjs.com]

### Branch-protection ruleset via `gh api` (RELEASE-04, document in-repo, maintainer applies)
```bash
# Source: GitHub REST — repos/{owner}/{repo}/rulesets (or classic branch protection)
gh api -X PUT repos/azatdavliatshin/next-auth-bridge/branches/main/protection \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -F 'required_status_checks[strict]=true' \
  -F 'required_status_checks[contexts][]=PR Title / validate' \
  -F 'enforce_admins=false' \
  -F 'restrictions=null'
```
Set `enforce_admins=false` (or add a bypass actor) so `@semantic-release/git` can push the release
commit — see Pitfall 4. Exact rule set is Claude's discretion.

### Auth.js docs recipe PR (RELEASE-05)
The authjs.dev docs live in the **`nextauthjs/next-auth`** monorepo `docs` workspace (a Nextra Next.js
app). Recipes/guides are MDX pages under `docs/pages/guides/`:
```
nextauthjs/next-auth
  docs/pages/guides/
    <slug>.mdx          # NEW recipe page (e.g. cross-context-iframe-bridge.mdx)
    _meta.js            # register: add  "<slug>": "Cross-Context Bridge (iframe + PWA)"
```
Existing siblings to model the recipe on: `integrating-third-party-backends.mdx`,
`creating-a-framework-integration.mdx`, `corporate-proxy.mdx`. The PR adds one `.mdx` file and one
line to `guides/_meta.js`. Fork → branch from `main` → PR against `nextauthjs/next-auth`.
[VERIFIED: GitHub contents API — nextauthjs/next-auth docs/pages/guides/]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| tsup (esbuild) | tsdown (Rolldown engine) | Rolldown 1.0 stable May 2026; tsdown still 0.x | Faster builds, official tsup-migration tool; D-06 accepts 0.x tsdown over stable Rolldown |
| Unsigned npm tarballs | Sigstore provenance attestation | npm provenance GA (npm ≥9.5) | `id-token: write` + GitHub-hosted runner yields verifiable source→artifact link (D-03) |
| Husky + commitlint | Hand-rolled `.githooks` + CI PR-title action | project choice (D-04/D-05) | Zero hook-management devDeps; CI covers the squash subject the local hook can't |

**Deprecated/outdated:**
- Nothing deprecated in scope. Note tsdown 0.22.2 published only 2026-06-10 (2 days before research)
  — re-verify the exact version at implementation time; the 0.x line moves fast.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | npm package name `next-auth-bridge` is owned/claimable by the maintainer | Runtime State Inventory | First publish fails if name is taken; verify `npm view next-auth-bridge` before pipeline goes live |
| A2 | `@semantic-release/git` will need a branch-protection bypass on `main` | Pitfall 4 | If kept without bypass, release job fails at push; planner must decide bypass-vs-drop-git-plugin |
| A3 | authjs.dev still uses Nextra `docs/pages/guides/*.mdx` + `_meta.js` at PR time | Code Examples (RELEASE-05) | Directory structure verified 2026-06-12 via contents API; re-confirm before opening PR (docs sites migrate to Fumadocs occasionally) |
| A4 | Exact branch-protection API shape (`/branches/.../protection` vs `/rulesets`) | Code Examples | Classic protection vs rulesets API differ; maintainer applies GitHub-side and adjusts — low risk, it's a documented manual step |

## Open Questions (RESOLVED)

1. **Keep or drop `@semantic-release/git`?**
   - What we know: RELEASE-01 wants a CHANGELOG entry; the `git` plugin re-commits it to `main`.
   - What's unclear: whether the maintainer wants the changelog persisted into `main` (needs a
     branch-protection bypass) or is content with the GitHub Release holding the notes.
   - Recommendation: default to keeping `changelog` + `git` with an Actions bypass actor on the
     ruleset; surface as a planning decision (Pitfall 4).
   - **RESOLVED (Plan 02 decision record):** Keep `@semantic-release/changelog` +
     `@semantic-release/git`; persist `CHANGELOG.md` into `main` via a scoped release-workflow
     bypass actor on the branch-protection ruleset (the `[skip ci]` re-commit). The bypass is
     scoped to the release-automation token only, not a general admin bypass — Pitfall 4
     resolved without weakening human protection.

2. **Release config location — root vs `packages/core`?**
   - What we know: D-03 leaves this to discretion; `pkgRoot: "packages/core"` lets root config publish the workspace package.
   - Recommendation: root `.releaserc.json` with `@semantic-release/npm` `pkgRoot` pointed at `packages/core`.
   - **RESOLVED (Plan 02 decision record):** Root `.releaserc.json` with `@semantic-release/npm`
     `pkgRoot: "packages/core"` — a single repo-root config publishes the workspace package.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (CI runner) | semantic-release 25, tsdown 0.22 | must be 22+ | runner-pinned | none — pin `node-version: 22` in workflow |
| pnpm | workspace install/build | ✓ (repo standard) | per repo | none |
| `gh` CLI | branch-protection + repo introspection | ✓ | (authenticated; used during research) | GitHub web UI for branch protection |
| npm registry access + `NPM_TOKEN` | publish (RELEASE-02) | secret not yet created | — | none — maintainer must add `NPM_TOKEN` repo secret |
| GitHub-hosted runner | provenance attestation (D-03) | ✓ (`ubuntu-latest`) | — | none — self-hosted cannot produce provenance |

**Missing dependencies with no fallback:**
- `NPM_TOKEN` repo secret (must be created before first live publish).
- Node 22 on the *publish runner* and the *maintainer's local toolchain* (commit-msg dev work is
  fine on any Node; only running semantic-release/tsdown needs 22+).

**Missing dependencies with fallback:**
- `gh`-based branch protection → GitHub web UI is an equivalent manual path.

## Validation Architecture

> nyquist_validation is enabled (config: `nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 (`packages/core`) |
| Config file | none dedicated — `vitest run` via `test` script |
| Quick run command | `pnpm --filter next-auth-bridge test` |
| Full suite command | `pnpm test` (workspace root) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RELEASE-03 | `.githooks/commit-msg` rejects malformed, accepts valid Conventional Commits | unit (bash) | `packages/core/src/__tests__/commit-msg.test.ts` driving the hook script with sample subjects | ❌ Wave 0 |
| D-06 | tsdown build emits `dist/index.{js,d.ts}` + `dist/store/kv.{js,d.ts}` (dist-parity) | integration (smoke) | `pnpm --filter next-auth-bridge build && node -e "import('next-auth-bridge/store/kv')"` + file-existence assertions | ❌ Wave 0 |
| RELEASE-01 | semantic-release config is valid + derives a version | smoke | `pnpm exec semantic-release --dry-run` (no publish) | ❌ Wave 0 |
| RELEASE-02/03/05 | workflows + recipe MDX are well-formed | manual-only | YAML lint + human review of recipe (cross-repo PR can't be CI-tested here) | n/a |

### Sampling Rate
- **Per task commit:** `pnpm --filter next-auth-bridge test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** full suite green + `semantic-release --dry-run` clean + D-02 human tarball inspection before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/core/src/__tests__/commit-msg.test.ts` — covers RELEASE-03 hook (valid/invalid/merge-passthrough subjects)
- [ ] dist-parity smoke check (script or test) — covers D-06 (`./store/kv` resolves post-migration)
- [ ] `semantic-release --dry-run` invocation in CI/local — covers RELEASE-01 config validity
- *(Framework already present — no Vitest install needed.)*

## Security Domain

> security_enforcement enabled (ASVS L1, block_on: high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth code in this phase (release tooling only) |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | Branch protection on `main` (RELEASE-04); `NPM_TOKEN` least-privilege automation token |
| V5 Input Validation | partial | `commit-msg`/PR-title regex validate commit subjects (governance, not security-critical) |
| V6 Cryptography | yes | Sigstore provenance (D-03) — never hand-roll signing; use npm `--provenance` |
| V14 Configuration / Supply Chain | yes | `files: ["dist"]` allowlist, provenance attestation, slopcheck-clean deps, pinned action SHA |

### Known Threat Patterns for release tooling

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious dependency in release toolchain | Tampering | slopcheck scan (all `[OK]`), pin `amannn/...` to SHA/`@v6`, `--frozen-lockfile` |
| Leaked `NPM_TOKEN` | Information Disclosure / Elevation | Least-privilege automation token, repo-secret only, never echoed in logs |
| Tarball includes secrets/source | Information Disclosure | `files: ["dist"]` + D-02 `npm pack --dry-run` human inspection |
| Unsigned/forged published artifact | Spoofing / Tampering | Sigstore provenance (`id-token: write`, GitHub-hosted runner); `npm audit signatures` verify |
| Compromised PR alters release subject to mis-version | Tampering | PR-title CI check + branch protection require-checks; squash subject reviewed |
| `pull_request_target` code execution | Elevation | PR-title check reads title only, never checks out/runs PR code |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`) — versions for semantic-release 25.0.5, all six plugins, tsdown 0.22.2,
  rolldown 1.1.1, tsdown-migrate 0.22.2; engines fields; tsdown postinstall (none); download counts.
- GitHub contents/releases API (`gh api`) — `nextauthjs/next-auth` `docs/pages/guides/` structure +
  `_meta.js`; `amannn/action-semantic-pull-request` latest tag v6.1.1.
- docs.npmjs.com/generating-provenance-statements — provenance prerequisites, `id-token: write`,
  hosted-runner requirement, `publishConfig.provenance`.
- semantic-release.gitbook.io/usage/configuration — default plugin order, config file names, branches.
- tsdown.dev/guide/migrate-from-tsup — `npx tsdown-migrate`, esm/dts/clean defaults, option renames.
- slopcheck 0.6.1 `scan` — all 9 release-tooling packages `[OK]`.

### Secondary (MEDIUM confidence)
- github.com/amannn/action-semantic-pull-request — usage, `!` breaking-change syntax, allowed types
  (WebSearch + repo, cross-verified with releases API for the pinned version).

### Tertiary (LOW confidence)
- Exact GitHub branch-protection API field shape (classic vs rulesets) — documented as a
  maintainer-applied manual step (A4); not tool-verified end-to-end this session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against npm registry; slopcheck-clean.
- Architecture: HIGH — semantic-release/provenance/tsdown patterns from official docs; recipe path
  verified against the live authjs repo.
- Pitfalls: MEDIUM-HIGH — Node-floor and provenance pitfalls verified; the `@semantic-release/git`
  vs branch-protection interaction is a known general issue flagged for a planning decision (A2).

**Research date:** 2026-06-12
**Valid until:** ~2026-06-19 for tsdown (7 days — 0.x moves fast; 0.22.2 was 2 days old at research);
~2026-07-12 for the semantic-release / provenance / authjs-path findings (30 days, stable).
