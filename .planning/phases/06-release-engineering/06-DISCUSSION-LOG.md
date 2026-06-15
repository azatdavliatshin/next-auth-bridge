# Phase 6: Release Engineering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-12
**Phase:** 6-release-engineering
**Areas discussed:** Module format, Publish scope & metadata, commit-msg hook mechanics, tsdown migration scope

---

## Module format

| Option | Description | Selected |
|--------|-------------|----------|
| Stay ESM-only | Ship v0.1.0 ESM-only; Next.js/Auth.js are ESM-first; add CJS later if needed | ✓ |
| Go dual ESM+CJS now | Conditional exports (import/require) for main + ./store/kv; doubles build/verify matrix | |
| ESM-only + explicit Node engines floor | ESM-only but pin engines.node + document the stance | |

**User's choice:** Stay ESM-only (Recommended)
**Notes:** CJS is a non-breaking additive change available later (v0.1.x/v0.2). The engines-floor idea was folded into the publish-metadata area (D-03) rather than kept as a separate format variant.

---

## Publish scope & metadata

### First-publish safety

| Option | Description | Selected |
|--------|-------------|----------|
| Dry-run gate first | Fill metadata, `npm publish --dry-run` / `pnpm pack` + inspect tarball, human sign-off, then enable live publish | ✓ |
| Trust the pipeline, publish on first green merge | Let first qualifying merge publish for real; rely on CI + files allowlist | |

**User's choice:** Dry-run gate first (Recommended)
**Notes:** npm publishes are irreversible per version; the first v0.1.0 tarball is human-verified before the pipeline goes live.

### Metadata & provenance posture

| Option | Description | Selected |
|--------|-------------|----------|
| Full hygiene: files allowlist + provenance + public access | files:[dist], publishConfig.access:public + provenance:true, engines>=18, repository/homepage/bugs, keywords | ✓ |
| Standard metadata, skip provenance | Same fields minus the provenance attestation; simpler workflow permissions | |
| Let researcher pick the exact field set | Lock files-allowlist + public + provenance intent; defer exact keywords/engines/URLs | |

**User's choice:** Full hygiene: files allowlist + provenance + public access (Recommended)
**Notes:** Provenance needs `id-token: write` in the publish workflow. Exact keyword list / engines value / URL forms remain Claude's discretion.

---

## commit-msg hook mechanics

### Hook implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled .githooks/commit-msg | Bash regex hook matching existing pre-commit convention; core.hooksPath, no husky, zero deps | ✓ |
| commitlint + husky | @commitlint/config-conventional + husky; featureful but adds devDeps + second hook mechanism | |
| commitlint config wired into existing .githooks | commitlint ruleset invoked from .githooks/commit-msg (no husky); middle path, adds devDep | |

**User's choice:** Hand-rolled .githooks/commit-msg (Recommended)
**Notes:** Consistent with the existing hand-rolled pre-commit hook; keeps the dependency surface minimal.

### PR-title CI guard

| Option | Description | Selected |
|--------|-------------|----------|
| Add CI PR-title check | GitHub Actions check validating PR title (the squash-merge subject semantic-release parses) | ✓ |
| Local hook only — maintainer discipline | Rely on maintainer setting the merge subject correctly | |

**User's choice:** Add CI PR-title check (Recommended)
**Notes:** The local hook can't enforce the squash-merge subject and external contributors won't have it activated; the merge subject is exactly what semantic-release parses. Cheap insurance for the release pipeline.

---

## tsdown migration scope

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate now, explicitly accepting tsdown 0.x | Swap in this phase; record explicit acceptance; mitigated by Rolldown 1.0 engine + D-02 dry-run gate | ✓ |
| Defer tsdown — publish on tsup, migrate post->=1.0 | Keep working tsup for v0.1.0; don't put a 0.x bundler in the release-critical path | |
| Migrate, but gate on pinned tsdown version + dist parity check | Swap now with pinned exact version + tsdown-vs-tsup dist-parity assertion | |

**User's choice:** Migrate now, explicitly accepting tsdown 0.x (Recommended)
**Notes:** Verified 2026-06-12 — Rolldown 1.0 (the engine) is stable (May 2026) but tsdown itself is still 0.x, so the roadmap's ">=1.0 gate" is met for the engine, not tsdown; acceptance recorded explicitly. The pinned-version + dist-parity tactic (option 3) was noted as a guard the researcher/planner MAY still adopt as the concrete migration approach.

## Claude's Discretion

- Exact semantic-release plugin set, config shape, and config location (root vs packages/core).
- Precise keywords list, exact engines.node floor value (>=18 intent), exact repository/homepage/bugs URLs.
- The exact commit-msg regex and permitted Conventional-Commits types (must cover the CLAUDE.md set).
- Whether tsdown migration uses pinned-version + dist-parity or relies solely on the D-02 dry-run gate.
- Exact branch-protection rule set on main (configured GitHub-side).
- Auth.js docs recipe content/structure and the authjs.dev contribution path.
- Whether the empty root package.json gains workspace-root release scripts.

## Deferred Ideas

- Dual ESM+CJS output — additive, revisit in v0.1.x/v0.2 if a consumer needs CJS.
- Permanent automated dist-parity CI check — one-time guard at most for v0.1.
- Real enterprise-host validation (SharePoint/Teams) as a post-publish soak item (carried from Phase 5).
- `next-auth-bridge/react` subpath with a ready-made /auth/popup — forward-compat, not v0.1.
- Minimal popup-only example (EXAMPLE-05) and Upstash adapter — roadmap-deferred.
