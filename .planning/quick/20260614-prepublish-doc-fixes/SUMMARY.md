---
quick_id: 20260614-prepublish-doc-fixes
slug: prepublish-doc-fixes
date: 2026-06-14
status: complete
doc_only: true
commit: cfed59e
---

# Summary: Pre-publish doc fixes (B4 + B5)

Two doc-only pre-publish gaps fixed inline. Strictly documentation — no publish metadata,
`.releaserc.json`, workflows, prepack, or branch protection touched.

## (1) README.md — Quick Start rewritten to the real public surface (B4)

Replaced the fictional Quick Start (which imported `createBridgeConfig`,
`next-auth-bridge/stores/vercel-kv`, `VercelKVStore`, `/server/bridge`, `/server/consume`,
`/pages/popup`, `/client` — none of which exist) with the actual API, mirroring
`examples/tenant-app`:

- `lib/auth-bridge.ts` — `createAuthBridge({ store: createKVTransferStore(), verifySession: () => auth(), allowedOrigins, secure: true })` -> `{ bridge, consume }`.
- `app/auth/bridge/route.ts` / `app/auth/consume/route.ts` — `GET`/`POST` delegating to `bridge`/`consume`.
- `middleware.ts` — `createBridgeMiddleware({ popupEntryPath, isAuthenticated })`.
- `app/auth/popup/page.tsx` — `runPopupFlow({ opener, hostOrigin })`.
- sign-in trigger — `openAuthPopup({ allowedOrigins, popupUrl, timeoutMs })` then redeem the
  one-time `code` via `fetch('/auth/consume?code=...', { credentials: 'include' })`;
  `OpenAuthPopupError.reason` for failure handling.

Every symbol verified against `packages/core/src/index.ts` / the KV subpath before writing.
Only the two real import paths appear: `next-auth-bridge` and `next-auth-bridge/store/kv`.

Fixed broken links: `examples/nextjs-app-router-multi-tenant` -> `examples/tenant-app` +
`examples/host-shell`; the dead `docs/architecture.md` reference ->
`docs/release-governance.md` + `docs/threat-model.md`.

## (2) docs/threat-model.md — THREAT-06 honesty boundary closed (B5)

In the "Honesty boundary — THREAT-06" prose section:

- "(planned for Phase 5)" -> the manual CHIPS partition-isolation check **was performed and
  recorded 2026-06-12** (positive + negative isolation cases), linking
  `examples/tenant-app/docs/live-validation.md` §4.
- Fetch-vs-navigation "deferred to Phase 5" -> "**verified in Phase 5: fetch is the resolved
  default**", linking the same file §5.

No THREAT-NN invariant weakened — only the prose honesty-boundary section changed; the STRIDE
register and the THREAT-06 row are intact.

## Verification (all acceptance criteria pass)

- `grep -nE "createBridgeConfig|/stores/|/server/|/pages/|/client'|VercelKVStore|nextjs-app-router|architecture.md" README.md` -> empty.
- All README Quick Start symbols/subpaths resolve against `packages/core/src/index.ts` + the exports map.
- `grep -n "planned for Phase 5\|deferred to Phase 5" docs/threat-model.md` -> empty; the file links `live-validation.md` (both link targets resolve).
- Full suite still green: 14 files / 126 tests.

## Commit
- `cfed59e` docs: fix README Quick Start to real API and close THREAT-06 honesty boundary
