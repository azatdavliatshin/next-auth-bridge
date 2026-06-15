---
quick_id: 20260614-npm-trusted-publishing
slug: npm-trusted-publishing
date: 2026-06-14
status: complete
type: research+docs
---

# Summary: npm Trusted Publishing (OIDC) — investigate + prepare

## Trigger
npm's classic-token screen now warns: "There are security risks with this option. For
automation or CI/CD uses, please use Trusted Publishing instead." Investigated whether to
adopt it.

## Findings
- **Trusted Publishing (OIDC)** is npm's recommended CI auth — GA since July 2025. Short-lived,
  workflow-scoped credentials; no long-lived `NPM_TOKEN` secret. Provenance is automatic.
- **Our stack already supports it:** `semantic-release` 25 (OIDC landed 25.0.1; we run 25.0.5);
  `release.yml` already grants `id-token: write`.
- **Hard limitation:** a brand-new package cannot use OIDC for its FIRST publish — the trusted-
  publisher config lives on the package's npmjs.com settings page, which only exists after the
  package is published (npm/cli#8544, unresolved). `next-auth-bridge` is not on npm (404), so the
  first `v0.1.0` must publish with a token (or a manual `npm publish`).
- **Requirements:** npm CLI >= 11.5.1 + Node >= 22.14.0; cloud runners only.
- **Scope:** TP replaces only the npm-registry credential. The `@semantic-release/git` CHANGELOG
  re-commit to `main` (GITHUB_TOKEN + branch-protection bypass) is unaffected.

## Decision
Two-phase rollout: bootstrap the first publish with a token, then switch to OIDC and remove the
token. Documented now; workflow prepped; token-removal deferred to post-first-publish.

## Changes
- `docs/release-governance.md` section 1 rewritten: "token bootstrap, then Trusted Publishing
  (OIDC)" with Phase A (token first publish) + Phase B (configure trusted publisher, remove token,
  disallow tokens). Notes the npm warning is correct and the token is a deliberate temporary bootstrap.
- `.github/workflows/release.yml`: `actions/setup-node@v4` -> `@v6`; `node-version: 22` -> `22.14`
  (npm >= 11.5.1 OIDC floor); inline comment on the Release step pointing to Phase B for token removal.
- `06-HUMAN-UAT.md`: added item 4 (post-first-publish OIDC switch; security hardening, not a merge blocker).

## Verification
- Both workflow files parse as valid YAML (python yaml.safe_load).
- Governance doc carries the full Phase A/B procedure.

## Sources
- https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/
- https://github.com/npm/documentation/blob/main/content/packages-and-modules/securing-your-code/trusted-publishers.mdx
- https://github.com/semantic-release/npm/issues/1023
- https://github.com/npm/cli/issues/8544
