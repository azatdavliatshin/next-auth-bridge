# Phase 6: Release Engineering - Context

**Gathered:** 2026-06-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes `next-auth-bridge` **publishable and governed**. It wires the automated release
pipeline (semantic-release driven by Conventional Commits → version, tag, npm publish, CHANGELOG,
GitHub Release), protects the published surface (branch protection on `main`, commit-message
governance), and opens the ecosystem discovery path (an Auth.js docs recipe PR against authjs.dev).
It also lands the carried-in build-tooling migration tsup → tsdown so the publish pipeline is
validated against the successor bundler in one pass.

Scope is fixed by ROADMAP Phase 6 (RELEASE-01..05) plus the Phase-1 carried-in concern (tsdown).
This is the final v0.1.0 milestone phase — the package ships from here.

**In scope:**
- semantic-release config: Conventional-Commits-driven version derivation, tag, npm publish,
  CHANGELOG entry, GitHub Release on merge to `main` (RELEASE-01).
- GitHub Actions workflow publishing `next-auth-bridge` to npm on merge to `main` via `NPM_TOKEN`
  (RELEASE-02).
- Local `commit-msg` hook rejecting non-Conventional-Commits messages before push (RELEASE-03),
  plus a CI PR-title guard for the squash-merge subject.
- MIT declared via root `LICENSE` + `package.json` `"license"` (no per-file headers — see CLAUDE.md);
  branch protection on `main` blocking direct pushes (RELEASE-04).
- Auth.js docs recipe PR for the bridge pattern, opened against authjs.dev (RELEASE-05).
- Build-tooling migration: tsup → tsdown (carried-in from Phase 1); ESM-only publish surface.
- Filling in missing npm publish metadata on `packages/core/package.json`.

**Out of scope (other phases / v0.2):**
- Dual ESM+CJS output — ESM-only for v0.1.0; CJS is additive later only if a real consumer needs it
  (D-01).
- Any Mode B / PWA-shell release surface — Mode A only at v0.1.0.
- The minimal popup-only example (EXAMPLE-05) — roadmap-deferred to v0.1.x.
- Upstash adapter — roadmap-deferred.
- A `next-auth-bridge/react` subpath shipping a ready-made `/auth/popup` — forward-compat, not v0.1.

</domain>

<decisions>
## Implementation Decisions

### Module format
- **D-01:** **ESM-only for v0.1.0.** The package is already ESM-only and the tsup config explicitly
  deferred "dual ESM+CJS" to this phase; the decision is to NOT add CJS now. Next.js / Auth.js v5 are
  ESM-first and consumers (Next.js apps) transpile it; dual format would double the build outputs and
  the exports-resolution matrix (`index` + `./store/kv` × esm+cjs) for no proven need. CJS is a
  non-breaking **additive** change available later (v0.1.x / v0.2) if a real consumer requires it.
  (Rejected: dual ESM+CJS now; a separate engines-floor-only variant — the engines floor is folded
  into D-03 instead.)

### Publish safety + metadata
- **D-02:** **Dry-run / pack-inspection gate before the first irreversible real publish.** Before
  enabling the live publish, fill all metadata, then run `npm publish --dry-run` (or `pnpm pack` and
  inspect the tarball contents) to confirm exactly what ships — correct `dist/` emit, `./store/kv`
  subpath present, no stray files. semantic-release's own dry-run mode validates the version-derivation
  step. A human verifies the first tarball before the pipeline goes live. (Rejected: trust the pipeline
  and publish on the first green merge — the first published tarball would be unverified, and npm
  publishes are irreversible per version.)
- **D-03:** **Full publish hygiene.** `files: ["dist"]` allowlist (LICENSE + README auto-included by
  npm, src/tests/configs excluded from the tarball); `publishConfig.access: "public"` +
  `provenance: true` (the publish workflow needs `id-token: write` for the signed source→tarball
  attestation); `engines.node >= 18`; `repository` / `homepage` / `bugs` pointing at
  `github.com/azatdavliatshin/next-auth-bridge`; `keywords` for npm discoverability. Slimmest
  trustworthy tarball with a verifiable supply-chain attestation — fits the project's correctness-first
  value. (Rejected: standard metadata without provenance; deferring the exact field set entirely —
  intent is locked, only the precise keyword list / engines value / exact URLs are Claude's discretion.)

### Commit-message governance
- **D-04:** **Hand-rolled `.githooks/commit-msg`** validating Conventional-Commits format with a regex,
  matching the existing `.githooks/pre-commit` convention (same `core.hooksPath .githooks` activation,
  no husky, zero runtime devDeps). Consistent with what's already in the repo and keeps the dependency
  surface minimal — fits the lean project style. (Rejected: commitlint + husky; commitlint config
  invoked from `.githooks` — both add a devDep and/or a second hook-management mechanism for a solo
  maintainer.)
- **D-05:** **CI PR-title Conventional-Commits check.** A lightweight GitHub Actions check validating
  the PR title (the squash-merge default subject) is Conventional-Commits-formatted. The local
  `commit-msg` hook (D-04) only guards the maintainer's local commits and external contributors won't
  have it activated — but the **squash-merge subject is exactly what semantic-release parses** on merge
  to `main`. This closes the gap the local hook structurally cannot cover; cheap insurance since the
  whole release pipeline keys off that one line. (Rejected: local hook only / maintainer discipline —
  a fat-fingered merge subject could mis-version or silently skip a release.)

### Build-tooling migration (carried-in from Phase 1)
- **D-06:** **Migrate tsup → tsdown now, explicitly accepting tsdown's pre-1.0 (0.x) state.** The
  roadmap's carried-in concern gated this on "tsdown ≥ 1.0 or accept its then-current pre-1.0 state
  explicitly." Current reality (verified 2026-06-12): **Rolldown 1.0 — the engine tsdown is built on —
  is stable (released May 2026), but tsdown itself is still 0.x**, so the ≥1.0 gate is met for the
  engine, not for tsdown. We accept tsdown 0.x explicitly, mitigated by (a) the stable Rolldown 1.0
  engine underneath and (b) the D-02 dry-run/pack gate verifying the actual emitted `dist/` and the
  `./store/kv` subpath resolution. Doing it here validates the publish pipeline against the successor
  bundler in one pass (the roadmap's stated rationale). Isolated change:
  `packages/core/tsup.config.ts`, the `build` script, the devDep. (Rejected: defer to a post-≥1.0
  patch — forgoes the one-pass validation and pushes the carry-in forward again. Also considered: pin
  exact tsdown 0.x + add a tsup→tsdown dist-parity assertion — a strong correctness guard the
  researcher/planner MAY still adopt as the concrete migration tactic, but not mandated over the
  D-02 gate.)

### Claude's Discretion
- Exact semantic-release plugin set and config shape (`@semantic-release/commit-analyzer`,
  `release-notes-generator`, `changelog`, `npm`, `git`, `github` — the conventional default stack)
  and where the config lives (root vs `packages/core`, `.releaserc` vs `release.config.js`).
- The precise `keywords` list, exact `engines.node` floor value (≥18 is the floor intent), and exact
  `repository`/`homepage`/`bugs` URL forms.
- The exact regex / matcher in the `.githooks/commit-msg` script and which Conventional-Commits types
  it permits (must at least cover the CLAUDE.md set: feat, fix, docs, refactor, test, chore, build,
  ci, perf, style, plus the `BREAKING CHANGE:` footer).
- Whether the tsdown migration uses a pinned-exact version + dist-parity check (D-06's considered
  tactic) or relies solely on the D-02 dry-run gate — researcher/planner choose.
- The exact branch-protection rule set on `main` (required checks, no-direct-push, PR-required) —
  configured GitHub-side; documented in the phase, applied by the maintainer.
- Auth.js docs recipe content/structure and the exact authjs.dev contribution path.
- Whether the root `package.json` (currently empty) gains workspace-root release scripts or the
  release config lives entirely under `packages/core`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning artifacts
- `.planning/ROADMAP.md` §"Phase 6: Release Engineering" — phase goal, 5 success criteria, and the
  carried-in tsup→tsdown concern with its ≥1.0 gate and isolated-change scope note.
- `.planning/REQUIREMENTS.md` — RELEASE-01..05 acceptance text (note RELEASE-04's "no per-file headers"
  intent reconciled with CLAUDE.md, and RELEASE-05's authjs.dev recipe target).
- `.planning/PROJECT.md` §"Key Decisions" — v0.1.0 = Mode A only; the milestone framing this phase closes.

### Project conventions + governance (authoritative for this phase)
- `CLAUDE.md` §"Versioning and releases" — semantic-release + Conventional Commits behavior, the
  three release steps per merge to `main`, the commit-msg-hook expectation, and the Conventional-Commit
  type list (feat/fix/docs/refactor/test/chore/build/ci/perf/style + `BREAKING CHANGE:` footer).
- `CLAUDE.md` §"Development workflow" — `main` (published surface, PR-only, branch-protected) vs `dev`
  (engineering); PRs squash-merged; the maintainer's `.planning/`-filtering PR-branch tooling
  (relevant to how releasable history reaches `main`).
- `CLAUDE.md` §"Style and conventions" — License declared once via root `LICENSE` + `package.json`
  `"license": "MIT"`; **do NOT add per-file SPDX/copyright headers** (this overrides RELEASE-04's
  literal "MIT license headers in new files" wording — declaration-once is the locked stance).
- `CLAUDE.md` §"Pre-commit hook" — the existing `.githooks/` + `core.hooksPath` convention the new
  `commit-msg` hook must match (D-04).
- `CLAUDE.md` §"Threat model discipline" — if any release-tooling change touches bridge/consume/cookie/
  detection logic (it should not), the threat-model.md + negative-test discipline applies.

### Package surface being published
- `packages/core/package.json` — current state: ESM-only `exports` map (`.` + `./store/kv`),
  `version: 0.1.0`, `license: MIT`, peer dep `@upstash/redis` (optional). **Missing** the publish
  metadata D-03 adds (`files`, `repository`, `keywords`, `publishConfig`, `engines`, `homepage`,
  `bugs`). `build` script currently runs `tsup`.
- `packages/core/tsup.config.ts` — the build config to migrate to tsdown (D-06): two entries
  (`index`, `store/kv`), `format: ["esm"]`, `dts: true`, `clean: true`. Its header comment already
  flags "dual ESM+CJS and full publish config deferred to Phase 6 (RELEASE-*)".
- `pnpm-workspace.yaml` — globs `packages/*` + `examples/*`; only `packages/core` is published.
- Root `package.json` — currently **empty**; may host workspace-root release scripts (Claude's
  discretion, D-03/decisions).
- `LICENSE` — MIT, already present at repo root (RELEASE-04 satisfied for the license-declaration half).

### Existing CI + hooks (extend, don't duplicate)
- `.github/workflows/keycloak-agnosticism.yml` — the one existing workflow (Phase 5 generic-OIDC CI).
  The new publish workflow (RELEASE-02) and PR-title check (D-05) are additional workflows alongside it.
- `.githooks/pre-commit` — the existing local-pattern no-op hook; the new `commit-msg` hook (D-04)
  must follow the same shape and `core.hooksPath` activation.

### External docs (fetch current versions during research — none committed in-repo)
- semantic-release docs — plugin stack, `.releaserc` config, the `npm` + `github` + `git` +
  `changelog` plugins, and the `NPM_TOKEN` / `GITHUB_TOKEN` CI requirements.
- tsdown docs (`tsdown.dev`) — migration from tsup (tsup-compatible options), ESM + dts emit, multi-entry
  config; **confirm the current tsdown version is 0.x and Rolldown 1.0 is the engine** (state as of
  2026-06-12; re-verify at implementation time — D-06).
- npm provenance docs — `--provenance` / `provenance: true`, the `id-token: write` workflow permission.
- GitHub branch-protection / rulesets docs — required-status-checks + no-direct-push on `main` (RELEASE-04).
- Auth.js (authjs.dev) contribution / docs-recipe path — how to open a recipe PR (RELEASE-05).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/core/tsup.config.ts` — the migration source for the tsdown swap; its two-entry + esm + dts
  shape maps directly onto tsdown's config.
- `.githooks/pre-commit` — template for the new `.githooks/commit-msg` (same activation, same no-dep
  bash style).
- `.github/workflows/keycloak-agnosticism.yml` — reference for the repo's GitHub Actions conventions
  (job/step shape, secrets usage) when authoring the publish + PR-title workflows.
- `LICENSE` (root, MIT) + `package.json` `"license": "MIT"` — the license-declaration is already done;
  RELEASE-04 only needs branch protection added.

### Established Patterns
- **Functional style, no classes** (project-wide) — release tooling is config + scripts, but any
  helper scripts follow the same lean, dependency-minimal style.
- **Lean dependency surface** — the existing hooks are hand-rolled bash, not husky; D-04 continues this.
- **Subpath isolation** (`./store/kv`) — the publish pipeline MUST preserve this subpath through the
  tsdown migration; the dry-run/pack gate (D-02) verifies `dist/store/kv.{js,d.ts}` emit and resolution.
- **No internal requirement IDs in shipped source** (from Phase 5's discreet mandate) — config files,
  workflows, hooks, and the Auth.js recipe ship publicly; keep them self-documenting with no
  `RELEASE-NN` / `D-NN` / `THREAT-NN` markers in committed source or comments.

### Integration Points
- `packages/core/package.json` — gains publish metadata (D-03) and a `build` script switched to tsdown.
- Root `package.json` (empty) — possible host for workspace-root release scripts / semantic-release config.
- `.github/workflows/` — NEW publish workflow (RELEASE-02) + NEW PR-title check (D-05), alongside the
  existing keycloak workflow.
- `.githooks/commit-msg` — NEW hook (D-04).
- `.releaserc` (or equivalent) — NEW semantic-release config (RELEASE-01).
- GitHub repo settings — branch protection on `main` (RELEASE-04, configured GitHub-side).
- authjs.dev repo — external PR target (RELEASE-05).

</code_context>

<specifics>
## Specific Ideas

- The dry-run/pack gate (D-02) should be a deliberate, visible step a human signs off on before the
  first live publish — not buried in CI. The whole point is that the first irreversible v0.1.0 tarball
  is inspected by a person.
- The publish workflow should publish with provenance (D-03) so the very first published version
  carries a verifiable source→artifact attestation — consistent with the project's correctness-first
  identity.
- The tsdown migration is intentionally isolated (config + build script + devDep) so a regression is
  attributable to one change and the dist-parity is checkable against the known-good tsup output.

</specifics>

<deferred>
## Deferred Ideas

- **Dual ESM+CJS output:** non-breaking additive change; revisit in v0.1.x/v0.2 only if a real consumer
  needs CJS (D-01).
- **Pinned-exact tsdown + automated dist-parity assertion as a standing CI check:** the migration uses
  it as a one-time correctness guard at most (D-06); a permanent parity job is more than v0.1 needs.
- **Real enterprise-host validation (SharePoint / Teams Tab) as a post-publish soak item:** carried
  from Phase 5's deferred list; a documented manual procedure, not release-pipeline scope.
- **`next-auth-bridge/react` subpath shipping a ready-made `/auth/popup`:** forward-compat from Phase 3
  D-13; additive optional React peer, not v0.1.
- **Minimal popup-only example (EXAMPLE-05) and Upstash adapter:** roadmap-deferred to v0.1.x / v0.2.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 6-release-engineering*
*Context gathered: 2026-06-12*
