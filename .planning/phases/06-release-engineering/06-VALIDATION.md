---
phase: 6
slug: release-engineering
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (`packages/core`) |
| **Config file** | none dedicated — `vitest run` via `test` script |
| **Quick run command** | `pnpm --filter next-auth-bridge test` |
| **Full suite command** | `pnpm test` (workspace root) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter next-auth-bridge test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + `semantic-release --dry-run` clean + D-02 human tarball inspection
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| RELEASE-03 | commit-msg | — | RELEASE-03 | — | Malformed commit subjects rejected before push; merge-commit subjects pass through | unit (vitest via child_process) | `packages/core/src/__tests__/commit-msg.test.ts` driving the hook with sample subjects | ❌ W0 | ⬜ pending |
| D-06 | tsdown | — | D-06 | — | Build emits `dist/index.{js,d.ts}` + `dist/store/kv.{js,d.ts}`; `./store/kv` subpath resolves | integration (smoke) | `packages/core/src/__tests__/dist-parity.test.ts` + `pnpm --filter next-auth-bridge build` + `node -e "import('next-auth-bridge/store/kv')"` | ❌ W0 | ⬜ pending |
| RELEASE-01 | semantic-release | — | RELEASE-01 | — | Config is valid and derives a version with no publish | smoke | `pnpm exec semantic-release --dry-run` | ❌ W0 | ⬜ pending |
| RELEASE-02 | publish-workflow | — | RELEASE-02 | — | Publish workflow YAML is well-formed; `id-token: write` present for provenance | manual + yaml-lint | YAML lint + human review | n/a | ⬜ pending |
| RELEASE-05 | authjs-recipe | — | RELEASE-05 | — | Recipe MDX is well-formed; cross-repo PR opened | manual-only | Human review (cross-repo PR can't be CI-tested here) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/src/__tests__/commit-msg.test.ts` — covers RELEASE-03 hook (valid/invalid/merge-passthrough subjects), driven via `child_process`
- [ ] `packages/core/src/__tests__/dist-parity.test.ts` — covers D-06 (`dist/index.*` + `dist/store/kv.*` emit; `./store/kv` resolves post-migration)
- [ ] `semantic-release --dry-run` invocation (local/CI) — covers RELEASE-01 config validity + version derivation

*Framework already present — no Vitest install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First live npm tarball is correct (D-02 gate) | RELEASE-02 / D-02 / D-03 | npm publish is irreversible per version; a human must sign off on the first tarball | Run `npm publish --dry-run` (or `pnpm pack` + inspect tarball): confirm `dist/` emit, `./store/kv` subpath present, no stray src/tests/configs, `files: ["dist"]` honored |
| Publish workflow + PR-title check trigger correctly | RELEASE-02 / D-05 | Real GitHub Actions behavior on merge to `main` can't be exercised from a local suite | Review workflow YAML; confirm on first merge that publish runs with provenance and PR-title guard blocks malformed subjects |
| Branch protection on `main` blocks direct pushes | RELEASE-04 | Configured GitHub-side, not in-repo | Attempt a direct push to `main`; confirm rejection; verify ruleset settings |
| Auth.js docs recipe PR opened | RELEASE-05 | External PR against authjs.dev (nextauthjs/next-auth) | Recipe MDX added at `docs/pages/guides/<slug>.mdx` + `_meta.js` registration; PR opened and link recorded |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (human checkpoints — D-02 gate, branch-protection apply, cross-repo PR — are exempt)
- [x] Sampling continuity: no 3 consecutive impl tasks without automated verify
- [x] Wave 0 covers all MISSING references (commit-msg test, dist-parity test, semantic-release dry-run)
- [x] No watch-mode flags (`vitest run`, not watch)
- [x] Feedback latency < 30s (~10s suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-12
