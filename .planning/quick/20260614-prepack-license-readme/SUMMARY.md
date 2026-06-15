---
quick_id: 20260614-prepack-license-readme
slug: prepack-license-readme
date: 2026-06-14
status: complete
commit: ecbcde3
resolves: CR-02 / 06-HUMAN-UAT item 2 / spawned task_0c80fade
---

# Summary: prepack LICENSE/README into the package tarball (CR-02)

The publishable package (`packages/core`, semantic-release `pkgRoot`) had `files: ["dist"]`,
so `npm publish --dry-run` packed neither LICENSE nor README — a legal gap and a blank npm
page. Code review flagged this as CR-02; the 06-04 D-02 sign-off flagged the same.

## Change
- `packages/core/scripts/copy-package-docs.mjs` — node copy script: copies the repo-root
  `LICENSE` + `README.md` (single source of truth) into `packages/core/` on `prepack`.
- `packages/core/package.json` — `"prepack": "node scripts/copy-package-docs.mjs"`.
- `packages/core/.gitignore` — ignores the generated `/LICENSE` + `/README.md` copies (build
  artifacts; not double-maintained).

## Dependency
The README rewrite this depended on was done first in the `prepublish-doc-fixes` quick task
(commit cfed59e) — so the copied README is the corrected, real-API version.

## Verification
- `cd packages/core && npm publish --dry-run` now lists `LICENSE` (1.1kB) + `README.md`
  (18.0kB) alongside `dist/` — 9 files total (was 7).
- Copied files are gitignored (`git check-ignore` confirms); only the script + config are
  committed.
- Copied README has 0 fictional symbols, 4 `createAuthBridge` refs.
- Full suite green: 14 files / 126 tests.

## Commit
- `ecbcde3` build(core): copy LICENSE + README into the package tarball via prepack
