# Release governance — next-auth-bridge

This document is the maintainer-facing runbook for the release pipeline: the one-time
account setup, the GitHub server-side branch protection, the per-clone hook activation,
and the human-inspected dry-run gate that precedes the first irreversible npm publish.

The pipeline itself is declared in-repo: `.releaserc.json` (the semantic-release plugin
chain), `.github/workflows/release.yml` (publish on merge to `main`), and
`.github/workflows/pr-title.yml` (the Conventional-Commits PR-title guard). This document
covers only the steps that live *outside* the repo — secrets, branch rules, and the human
sign-off — because those cannot be committed as files.

---

## 1. npm authentication: token bootstrap, then Trusted Publishing (OIDC)

npm's recommended CI auth is **Trusted Publishing** (OIDC) — short-lived, workflow-scoped
credentials with no long-lived secret to store, rotate, or leak (generally available since
July 2025). This project's stack already supports it: `semantic-release` 25 (OIDC support
landed in 25.0.1) and a `release.yml` that already grants `id-token: write`.

There is **one hard limitation**: you cannot configure a trusted publisher for a package
that does not yet exist on the registry (the config lives on the package's npmjs.com
settings page, which only appears after the first publish). So the rollout is two-phase:
bootstrap the first version with a token, then switch to OIDC and remove the token.

### Phase A — first publish (`v0.1.0`) with a token

1. **Confirm the package name is owned or claimable:**

   ```bash
   npm view next-auth-bridge
   ```

   A `404` means the name is unclaimed and the first publish will register it. If it
   resolves to a package you do not own, the name must be changed before publishing.

2. **Create an automation token** at npmjs.com -> Access Tokens -> Generate New Token ->
   Automation (this token type bypasses 2FA prompts in CI and carries publish scope).

   > npm shows a warning on the classic-token screen recommending Trusted Publishing for
   > CI/CD. That warning is correct — the token here is a deliberate, temporary bootstrap
   > for the very first publish only; Phase B removes it.

3. **Add it as a repo secret** named `NPM_TOKEN`:

   ```bash
   gh secret set NPM_TOKEN --repo azatdavliatshin/next-auth-bridge
   ```

   The release workflow reads `NPM_TOKEN` for the live publish. It is **not** needed for
   the dry-run gate below (the dry-run never publishes).

   (Alternatively, the first version can be published by hand — `cd packages/core && npm publish`
   from a machine logged into npm — which skips the CI token entirely. The token path is
   simpler if the release workflow is already wired.)

### Phase B — switch to Trusted Publishing (DONE 2026-06-14)

Status: the trusted publisher is configured on npmjs.com and `release.yml` now
authenticates via OIDC. Steps, for the record:

1. On npmjs.com -> the package -> **Settings -> Trusted Publisher -> GitHub Actions**, set:
   - **Organization or user:** `azatdavliatshin`
   - **Repository:** `next-auth-bridge`
   - **Workflow filename:** `release.yml` (filename only, not a path)
   - **Allowed actions:** `npm publish`
2. In `release.yml`, the npm auth env is removed entirely. It is NOT enough to drop
   only the `NPM_TOKEN` line: `setup-node`'s `registry-url` writes a managed `.npmrc`
   that pins `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` and shadows OIDC,
   so token auth would still win. The complete switch removed **all** of:
   - `NPM_TOKEN` and `NODE_AUTH_TOKEN` env entries on the Release step,
   - `registry-url` on the `setup-node` step,
   - `NPM_CONFIG_PROVENANCE` (OIDC generates provenance automatically).
   `id-token: write` stays; npm (>= 11.5.1 via Node 22.14) then auto-detects OIDC.
   `RELEASE_TOKEN` is unaffected — it is the *git* push credential, not npm auth.
3. **Delete the `NPM_TOKEN` repo secret** once a second release has published cleanly via OIDC:

   ```bash
   gh secret delete NPM_TOKEN --repo azatdavliatshin/next-auth-bridge
   ```

   (Pending — keep the secret until the first OIDC publish is confirmed green, then delete.)

4. For maximum hardening, on npm set the package's **Publishing access -> "Require
   two-factor authentication and disallow tokens"** so only Trusted Publishing (and
   interactive 2FA) can publish.

**Requirements for OIDC:** npm CLI >= 11.5.1 and Node >= 22.14.0 on the runner; cloud-hosted
runners only (self-hosted is not yet supported). `release.yml` pins Node 22 with a patch >=
22.14 so the bundled npm satisfies the floor.

Provenance (`publishConfig.provenance: true` in `packages/core/package.json`) requires the
workflow to run with `id-token: write`; that permission is already set in `release.yml` and
serves both the token-bootstrap provenance and the later OIDC flow. The `repository.url` in
`packages/core/package.json` must match the publishing source case-sensitively for the
Sigstore attestation to verify.

> The Trusted Publishing switch only replaces the **npm registry** credential. It does NOT
> affect the `@semantic-release/git` CHANGELOG re-commit to `main`, which uses the workflow's
> `GITHUB_TOKEN` and the branch-protection bypass actor in section 2 — that stays as is.

---

## 2. Branch protection on `main`

`main` is the published surface. It must be PR-only, require the PR-title check, and block
direct pushes — with a single scoped exception so the release automation can push the
CHANGELOG re-commit (see the keep-git note below).

**Plan prerequisite:** branch protection on a personal account is only enforceable on a
**public** repo under GitHub Free (private repos need Pro/Team). If the repo is private on
Free, either make it public (`gh repo edit <owner>/<repo> --visibility public
--accept-visibility-change-consequences`) or upgrade — otherwise the API below no-ops/403s.

Apply with the classic branch-protection API. Send a typed JSON body via `--input -` (the
`-f` flag sends every value as a string, so `required_approving_review_count=0` arrives as
`"0"` and the API rejects it with a 422 "is not an integer"):

```bash
gh api -X PUT repos/azatdavliatshin/next-auth-bridge/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["PR Title / validate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

Notes:

- `required_status_checks.contexts` must match the actual check name produced by
  `pr-title.yml` (adjust the string if the workflow/job name differs). A status check only
  registers as required after it has run once — if the name errors, set
  `"required_status_checks": null` first, open one PR so the check runs, then re-add it.
  Discover the real name with:
  `gh api repos/<owner>/<repo>/commits/main/check-runs --jq '.check_runs[].name'`.
- The classic protection API and the newer **rulesets** API have different shapes. If you
  prefer rulesets (repo Settings -> Rules), create a ruleset targeting `main` with
  "Require a pull request before merging" + "Require status checks to pass" (the PR-title
  check), and add the release-automation bypass actor under the ruleset's bypass list.
- The web UI is an equivalent path: Settings -> Branches -> Add branch protection rule.

### Release-token bypass actor (keep-git decision)

The semantic-release chain keeps `@semantic-release/changelog` + `@semantic-release/git`,
so on each release the automation commits the updated `CHANGELOG.md` and bumped version
back to `main` with a `[skip ci]` message (the `[skip ci]` guards against a release loop).
That push lands on protected `main`, so the release workflow's token must be allowed to
bypass the protection.

Scope the bypass to the release automation only:

- With classic protection, `enforce_admins=false` (above) lets an admin-equivalent token
  push; prefer a dedicated bypass actor where available.
- With rulesets, add **only** the release workflow identity (e.g. the GitHub Actions app
  for this repo, or a dedicated release bot) to the ruleset bypass list.

This is a narrow, documented exception for the changelog re-commit — **not** a general
admin bypass. Human contributors remain fully gated behind PRs and the PR-title check.

---

## 3. Hook activation (per clone)

The repo ships a `commit-msg` hook (Conventional-Commits validator) and a `pre-commit`
hook under `.githooks/`. Git does not run them until a clone opts in:

```bash
git config core.hooksPath .githooks
```

This is per-clone local state — it is not inherited by fresh clones and cannot be enforced
repo-side. The hooks are inert until activated. External contributors who never run this
command are still covered server-side by the `pr-title.yml` Conventional-Commits check on
every PR, so a malformed subject is caught at the PR boundary even without the local hook.

---

## 4. Dry-run / pack-inspection gate (before the first live publish)

npm publishes are irreversible per version. Before the pipeline goes live, a human inspects
exactly what would ship and confirms the semantic-release config derives a clean version.
This is a repeatable governance step — run it before every first publish of a new package,
and any time the publish surface changes materially.

1. **Build the package:**

   ```bash
   pnpm --filter next-auth-bridge build
   ```

2. **Inspect the tarball contents (no publish):**

   ```bash
   pnpm --filter next-auth-bridge pack --dry-run
   # or, equivalently:  cd packages/core && npm publish --dry-run
   ```

   Confirm the file list contains exactly:

   - `dist/index.js`, `dist/index.d.ts`
   - `dist/store/kv.js`, `dist/store/kv.d.ts`
   - `package.json`, `LICENSE`, `README` (npm auto-includes the latter two)

   And confirm it contains **none** of: `src/`, `__tests__/`, `*.test.ts`,
   `tsdown.config.ts`, or any other config. The `files: ["dist"]` allowlist in
   `packages/core/package.json` enforces this; the inspection verifies it held.

3. **Validate the semantic-release config and version derivation (no publish):**

   ```bash
   pnpm exec semantic-release --dry-run
   ```

   This needs a `GITHUB_TOKEN` in the environment (no `NPM_TOKEN` — it must not publish).
   It must exit `0` and print the derived next version. If `GITHUB_TOKEN` is absent the
   version-derivation check cannot run — do not silently skip it; supply a token and re-run,
   or explicitly accept the gap before approving.

4. **Sign off.** Only after the tarball list is clean and the dry-run derived a version is
   the pipeline cleared to publish on the next merge to `main`. If anything is wrong (a
   stray file, a missing subpath, a dry-run error), stop and fix it before approving.
