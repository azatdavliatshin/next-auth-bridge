---
phase: 06-release-engineering
verified: 2026-06-14T18:20:00Z
status: passed
score: 5/5 must-have truth-groups verified (shipped + governed)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "5/5 in-repo; 3 human/server-side items pending"
  reason: "Re-verified after v0.1.0 shipped. The two required-before-merge human items (server-side branch protection, CR-02 prepack LICENSE/README) are RESOLVED and confirmed against the live repo + published npm tarball. RELEASE-01..04 are now realized in the shipped package, not merely configured."
  gaps_closed:
    - "RELEASE-04 server-side: main is governed by repository ruleset 'main protection' (id 17659258), enforcement active — verified via gh api."
    - "CR-02: published next-auth-bridge@0.1.0 tarball ships LICENSE + README.md — verified via npm pack of the published 0.1.0."
    - "RELEASE-01 executed (not just configured): npm version 0.1.0 published with SLSA provenance attestation; git tag v0.1.0; GitHub Release v0.1.0; CHANGELOG.md on main."
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Auth.js docs recipe PR opened against nextauthjs/next-auth (RELEASE-05 cross-repo half)"
    addressed_in: "Post-publish (06-HUMAN-UAT item 3, priority: deferred — optional)"
    evidence: "In-repo recipe source docs/recipes/authjs-cross-context-bridge.mdx present and cites the real public API; cross-repo PR is an external action intentionally deferred per HUMAN-UAT."
  - truth: "Switch npm publishing to Trusted Publishing / OIDC (drop NPM_TOKEN)"
    addressed_in: "Post-first-publish hardening (06-HUMAN-UAT item 4, Phase B in docs/release-governance.md)"
    evidence: "A brand-new package cannot use OIDC for its first publish; workflow already prepped with id-token: write + Node 22. Security hardening follow-up, not a merge blocker or phase gap."
---

# Phase 6: Release Engineering Verification Report

**Phase Goal:** The package is publishable and governed — versioned releases flow automatically from Conventional Commits, the published surface is protected, and the ecosystem has a discovery path via the Auth.js docs recipe.
**Verified:** 2026-06-14T18:20:00Z
**Status:** passed
**Re-verification:** Yes — re-verified after v0.1.0 shipped. Supersedes the 2026-06-14T10:39:36Z `human_needed` report (which referenced a stale 126-test count and pre-dated both the branch-protection apply and the actual publish).

## Goal Achievement

The phase goal is fully realized. The package is not merely *publishable and configured* — it is **published and governed**: `next-auth-bridge@0.1.0` is live on npm with SLSA provenance, `main` is protected by an active repository ruleset, the commit pipeline is guarded locally (commit-msg hook) and in CI (pr-title check), and the ecosystem discovery path (recipe source) exists in-repo with the only-remaining cross-repo PR intentionally deferred.

### Observable Truths

| # | Truth (success criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| SC1 | semantic-release derives version from commit types → tag, npm publish, CHANGELOG, GitHub Release on merge to main | ✓ VERIFIED | **Executed, not just configured.** `npm view next-auth-bridge version` → `0.1.0`; git tag `v0.1.0` exists; GitHub Release `v0.1.0` (Latest, 2026-06-14T12:39:11Z) via `gh release list`; `CHANGELOG.md` committed on main; `packages/core/package.json` version = `0.1.0`. `.releaserc.json` six-plugin chain drove it. |
| SC2 | GitHub Actions publishes next-auth-bridge to npm on merge to main with NPM_TOKEN | ✓ VERIFIED | **Confirmed by the live publish.** `npm view next-auth-bridge dist.attestations` → `provenance { predicateType: https://slsa.dev/provenance/v1 }` + a signature — proves `release.yml` ran with `id-token: write`. Workflow sets `NODE_AUTH_TOKEN: secrets.NPM_TOKEN`, `NPM_CONFIG_PROVENANCE`, `pnpm exec semantic-release`. The `@semantic-release/git` CHANGELOG re-commit pushes as owner via `RELEASE_TOKEN` PAT. |
| SC3 | commit-msg hook rejects non-Conventional-Commits locally | ✓ VERIFIED | `.githooks/commit-msg` present + executable; CC regex with merge/revert/fixup/squash passthrough. PR-title CI guard (`pr-title.yml`, job `validate`, amannn/action-semantic-pull-request SHA-pinned v6.1.1) is the required status check on main. 129/129 tests green incl. subprocess-driven `commit-msg.test.ts`. |
| SC4 | MIT declared via root LICENSE + package.json license; main has branch protection | ✓ VERIFIED | **Both halves realized.** In-repo: root `LICENSE`, `packages/core/package.json` `"license":"MIT"`, no per-file headers. Server-side: repository ruleset "main protection" (id 17659258), `enforcement: active`, rules = `pull_request` + `required_status_checks` (`pr-title / validate`) + `required_linear_history` + `non_fast_forward` + `deletion`, bypass actor = RepositoryRole admin (so the owner pushes the `@semantic-release/git` re-commit). Verified via `gh api .../rulesets/17659258`. CR-02 resolved: published `0.1.0` tarball ships `package/LICENSE` + `package/README.md` (verified via `npm pack next-auth-bridge@0.1.0`). |
| SC5 | Auth.js docs recipe PR opened against authjs.dev | ✓ VERIFIED (in-repo deliverable) + deferred cross-repo PR | In-repo source present: `docs/recipes/authjs-cross-context-bridge.mdx` cites the real public API (`createAuthBridge`, `createInMemoryTransferStore`, `createKVTransferStore`). The cross-repo PR to nextauthjs/next-auth is intentionally deferred (post-publish, optional per 06-HUMAN-UAT item 3) — recorded in `deferred`, not a gap. |

**Score:** 5/5 must-have truth-groups verified. SC1–SC4 are fully realized in the shipped, governed package. SC5's in-repo deliverable is present; its external cross-repo PR is a deferred, optional post-publish action.

### Deferred Items

Items not blocking the phase goal, explicitly recorded as post-publish follow-ups.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Cross-repo Auth.js docs recipe PR (RELEASE-05 external half) | Post-publish (06-HUMAN-UAT item 3, optional) | In-repo recipe source present; cross-repo PR is an external action deferred by design. |
| 2 | npm Trusted Publishing / OIDC switch (drop NPM_TOKEN) | Post-first-publish hardening (HUMAN-UAT item 4, Phase B) | First publish of a new package can't use OIDC; workflow pre-prepped with `id-token: write`. Security hardening, not a phase gap. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.releaserc.json` | Six-plugin chain, branches [main], pkgRoot packages/core, [skip ci] git guard | ✓ VERIFIED | Drove the live 0.1.0 release end-to-end. |
| `.github/workflows/release.yml` | Publish on main, id-token: write, provenance, semantic-release | ✓ VERIFIED | Live publish with provenance attestation confirms it ran correctly. RELEASE_TOKEN PAT for owner push. |
| `.github/workflows/pr-title.yml` | Conventional-Commits PR-title guard, job `validate` | ✓ VERIFIED | SHA-pinned v6.1.1; `pr-title / validate` is the required status check on the ruleset. |
| `.githooks/commit-msg` | CC validator, merge/revert passthrough | ✓ VERIFIED | Present, executable, behaviorally tested. |
| `packages/core/package.json` | files allowlist, provenance, license MIT, exports, prepack | ✓ VERIFIED | `files:["dist"]` + `prepack` copies LICENSE/README; `publishConfig.provenance:true`; `license:"MIT"`; exports `.` + `./store/kv` + `./middleware`. |
| `packages/core/scripts/copy-package-docs.mjs` | prepack LICENSE + README copy (CR-02) | ✓ VERIFIED | Wired as `prepack`; published tarball ships both files. |
| `docs/release-governance.md` | Branch-protection recipe + NPM_TOKEN + hook + dry-run gate | ✓ VERIFIED | Governance runbook present (incl. Phase B OIDC procedure). |
| `docs/recipes/authjs-cross-context-bridge.mdx` | Cites real public API | ✓ VERIFIED | Real exports cited. |
| `CHANGELOG.md` | Generated on main by semantic-release | ✓ VERIFIED | Committed on main, generated by the 0.1.0 release. |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| release.yml | npm registry (published artifact) | ✓ WIRED | next-auth-bridge@0.1.0 live with provenance — the publish actually executed. |
| release.yml @semantic-release/git | main (CHANGELOG re-commit) | ✓ WIRED | Ruleset admin bypass actor + RELEASE_TOKEN PAT allow the owner push; CHANGELOG.md on main confirms it landed. |
| pr-title.yml `validate` | ruleset required status check | ✓ WIRED | `gh api` shows `required_status_checks: [{context: "pr-title / validate"}]`. |
| package.json prepack | scripts/copy-package-docs.mjs → tarball LICENSE/README | ✓ WIRED | Published tarball contains package/LICENSE + package/README.md. |
| package.json exports ./store/kv, ./middleware | dist subpaths | ✓ WIRED | dist/store/kv.{js,d.ts} + dist/middleware.{js,d.ts} present in tarball. |
| ruleset "main protection" | main branch | ✓ WIRED | enforcement: active; PR-only + linear history + block force-push/deletion. |

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Package published to npm | `npm view next-auth-bridge version` | `0.1.0` | ✓ PASS |
| Published with SLSA provenance | `npm view next-auth-bridge dist.attestations` | predicateType slsa.dev/provenance/v1 + signature | ✓ PASS |
| Tarball ships LICENSE + README | `npm pack next-auth-bridge@0.1.0` + `tar -tzf` | package/LICENSE + package/README.md present (13 files) | ✓ PASS |
| Git tag exists | `git tag -l v*` | `v0.1.0` | ✓ PASS |
| GitHub Release exists | `gh release list` | `v0.1.0` Latest | ✓ PASS |
| main governed by ruleset | `gh api .../rulesets/17659258` | enforcement active; required check pr-title / validate; admin bypass | ✓ PASS |
| Full test suite green | `pnpm test` | 14 files, 129/129 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RELEASE-01 | 06-02 | semantic-release config (version/tag/npm/CHANGELOG/Release) | ✓ SATISFIED | Fully realized: 0.1.0 tag + npm publish + CHANGELOG + GitHub Release all live. |
| RELEASE-02 | 06-03 | GH Actions npm publish on main with NPM_TOKEN | ✓ SATISFIED | Live publish with provenance proves the workflow ran. |
| RELEASE-03 | 06-03 | commit-msg hook validates CC locally | ✓ SATISFIED | Hook + subprocess test green; pr-title CI required check. |
| RELEASE-04 | 06-01, 06-04 | MIT declared (root) + branch protection | ✓ SATISFIED | MIT root declaration; ruleset "main protection" active; tarball ships LICENSE (CR-02 resolved). |
| RELEASE-05 | 06-04 | Auth.js docs recipe PR | ✓ SATISFIED (in-repo) | Recipe source in-repo citing real API; cross-repo PR deferred (optional/post-publish). |

No orphaned requirement IDs — all five RELEASE-* accounted for.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | TBD/FIXME/XXX scan across phase files | — | Clean — zero unreferenced debt markers. |

### Human Verification Required

None blocking. The two previously-required-before-merge human items are RESOLVED and verified against live infra (branch protection ruleset; CR-02 prepack confirmed in the published tarball). Two optional post-publish follow-ups remain (cross-repo recipe PR; npm OIDC switch) — recorded as `deferred`, not gaps.

### Gaps Summary

No gaps. The phase goal — "publishable and governed" — is realized as **published and governed**. Live evidence (not SUMMARY claims): npm shows 0.1.0 with SLSA provenance; the published tarball ships LICENSE + README; git tag v0.1.0, GitHub Release v0.1.0, and CHANGELOG.md on main all exist; `main` is protected by an active repository ruleset with the `pr-title / validate` required check and a scoped admin bypass actor enabling the automated CHANGELOG re-commit. The full suite is 129/129 green (was 126 at the stale verification; the Edge-safe `./middleware` subpath added 3 tests and a third export). The cross-repo Auth.js PR and the npm OIDC switch are intentionally deferred post-publish follow-ups.

This report supersedes the 2026-06-14T10:39:36Z `human_needed` verification.

---

_Verified: 2026-06-14T18:20:00Z_
_Verifier: Claude (gsd-verifier) — re-verification after v0.1.0 shipped_
