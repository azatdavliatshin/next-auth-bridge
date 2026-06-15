---
quick_id: 20260614-prepublish-doc-fixes
slug: prepublish-doc-fixes
date: 2026-06-14
type: quick
doc_only: true
---

# Quick task: Pre-publish doc fixes (B4 + B5)

Two doc-only gaps not covered by any Phase 6 plan or UAT item. Scope is strictly
documentation — no publish metadata, `.releaserc.json`, workflows, prepack, or branch
protection (done or tracked elsewhere).

## (1) README.md — real public surface in the Quick Start (B4)

The current Quick Start imports symbols/subpaths that do not exist
(`createBridgeConfig`, `next-auth-bridge/stores/vercel-kv`, `VercelKVStore`,
`/server/bridge`, `/server/consume`, `/pages/popup`, `/client`). Rewrite it against the
REAL surface, mirroring `examples/tenant-app`. Only two import paths exist:
`next-auth-bridge` and `next-auth-bridge/store/kv`.

Real symbols (verified against `packages/core/src/index.ts`):
- `createAuthBridge({ store, verifySession, allowedOrigins, secure? }) -> { bridge, consume }`
- `createKVTransferStore()` from `next-auth-bridge/store/kv`
- `createBridgeMiddleware({ popupEntryPath, isAuthenticated })`
- `runPopupFlow({ opener, hostOrigin, fetch?, bridgePath? })`
- `openAuthPopup({ allowedOrigins, popupUrl?, timeoutMs? }) -> Promise<{ code }>`, `OpenAuthPopupError`

Also fix broken links: `examples/nextjs-app-router-multi-tenant` -> the real
`examples/tenant-app` + `examples/host-shell`; the dead `docs/architecture.md` reference
-> `docs/release-governance.md` + `docs/threat-model.md`.

## (2) docs/threat-model.md — close the THREAT-06 honesty boundary (B5)

In the "Honesty boundary — THREAT-06" section:
- Replace "(planned for Phase 5)" with the recorded live result (manual CHIPS
  partition-isolation check performed 2026-06-12), linking
  `examples/tenant-app/docs/live-validation.md` (§4 isolation, §5 fetch-transport).
- Change "deferred to Phase 5" for the fetch-vs-navigation question to "verified in
  Phase 5: fetch is the resolved default", linking the same file.
- Do NOT weaken any THREAT-NN invariant; the registry stays intact.

## Acceptance
- `grep -nE "createBridgeConfig|/stores/|/server/|/pages/|/client'|VercelKVStore|nextjs-app-router|architecture.md" README.md` returns nothing.
- Every symbol/subpath in the README Quick Start resolves against `packages/core/src/index.ts` + the package.json exports map.
- `grep -n "planned for Phase 5\|deferred to Phase 5" docs/threat-model.md` returns nothing; the file links `live-validation.md`.
