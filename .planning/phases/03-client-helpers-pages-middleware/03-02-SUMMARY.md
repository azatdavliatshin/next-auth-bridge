---
phase: 03-client-helpers-pages-middleware
plan: 02
type: execute
wave: 2
status: complete
requirements: [CLIENT-01, CLIENT-04]
---

# 03-02 SUMMARY — Popup-flow orchestrator + context-routing middleware factory

## What was built

Two framework-agnostic Wave-2 helpers that consume the Wave-1 DI fakes:

- **`packages/core/src/popup-flow.ts`** — `runPopupFlow(deps)`: the popup-side
  orchestrator. In the popup's top-level (silent-auth) context it fetches
  `/auth/bridge` via an injected `fetch`, reads `{ code }` from the 200 JSON
  body, and posts `{ source: "next-auth-bridge", type: "auth-success", code }`
  to the opener with an **explicit** `targetOrigin` (`deps.hostOrigin`), never
  the wildcard `"*"`. All browser globals (`fetch`, opener) are injected as
  parameters — DOM-free, matching the Wave-1 pattern. (CLIENT-01)
- **`packages/core/src/middleware.ts`** — `createBridgeMiddleware(options)`: a
  store-free, crypto-free context-routing factory. Routes an unauthenticated
  embedded request (`Sec-Fetch-Dest: iframe`) to the popup entry via
  `rewrite` (URL unchanged), and passes through (`next()`) for
  browser / absent-`Sec-Fetch-Dest` requests and for all authenticated
  requests. (CLIENT-04, D-08/D-09/D-10/D-16)

## Requirements coverage (must-haves)

- [x] `runPopupFlow` fetches `/auth/bridge`, reads `{ code }` from the 200 body, posts to opener with explicit `targetOrigin` (never `"*"`) — asserted in `popup-flow.test.ts`.
- [x] `createBridgeMiddleware` rewrites (URL unchanged), not redirects, for unauthenticated embedded requests.
- [x] Passes through for browser/absent-`Sec-Fetch-Dest` and all authenticated requests.
- [x] Forged `Sec-Fetch-Dest` changes only the UX target; the allow/deny security outcome is invariant across present/absent/forged at a fixed auth state (forged-signal invariance test).
- [x] Structural assertion: `middleware.ts` imports nothing — no `verifySession`, no transfer store, no `node:crypto` (D-16/D-10). Confirmed: zero import statements in the module.

## Key files

### Created
- `packages/core/src/popup-flow.ts` — `runPopupFlow` orchestrator
- `packages/core/src/middleware.ts` — `createBridgeMiddleware` factory
- `packages/core/src/__tests__/popup-flow.test.ts` — CLIENT-01 data-flow + never-`"*"` targetOrigin assertions
- `packages/core/src/__tests__/middleware.test.ts` — CLIENT-04 routing + forged-signal invariance + structural no-store/no-crypto assertion

## Verification

- `pnpm test -- middleware` → 6/6 pass.
- Full suite → 10 files / 86 tests green (was 81 after 03-03; no regression).
- `tsc --noEmit` clean.
- Forbidden-token grep on shipped `src/middleware.ts` (`CLIENT-|THREAT-|D-0[0-9]|node:crypto|@upstash`) → clean.
- `middleware.ts` import list → empty (store-free / crypto-free structural invariant holds).

## Deviations

- **Execution interruption (recovered by orchestrator):** mid-plan the executor
  agent lost Bash access after committing Task 1 (`runPopupFlow`, `863e41a`).
  Task 2's `middleware.ts` + test were written to the worktree but uncommitted.
  The orchestrator re-ran the GREEN-gate verification (middleware tests, full
  suite, tsc, token grep — all clean) and committed Task 2 atomically
  (`0a61545`) plus this SUMMARY. No code authored by the orchestrator; only
  verification + commit of the executor's on-disk work.

## Self-Check: PASSED
