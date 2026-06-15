---
phase: 02-bridge-consume-routes
plan: 01
subsystem: auth
tags: [auth.js, cookies, chips, open-redirect, transfer-store, vitest, fetch-api]

# Dependency graph
requires:
  - phase: 01-transferstore-adapters
    provides: TransferStore interface (create/consume), createInMemoryTransferStore, generate-code convention, contract-suite test pattern
provides:
  - TransferPayload reshaped to Array<{name,value}> chunk entries (D-01)
  - sanitizeNext (ROUTE-06/THREAT-08 open-redirect control) + getAuthCookieName (D-16) as pure, separately-importable functions
  - cookie-codec.ts — parseCookieHeader, harvestSessionChunks, serializeSetCookie (D-03/D-05/D-17)
  - top-level types.ts — AuthBridgeOptions + VerifySession (structural, version-agnostic, D-04/D-11/D-16/D-17)
  - shared test fixtures — makeRequest, fakeVerifySession, makeTestStore (in-memory only)
affects: [bridge-route, consume-route, create-auth-bridge, phase-02-wave-2, phase-02-wave-3, phase-04-threat-model]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure stateless helper modules (generate-code.ts shape): decision-citing header + bare exported functions, no class/factory"
    - "Structural, version-agnostic typing of injected deps (VerifySession) — no vendor Auth.js type imported"
    - "Chunk-array TransferPayload: cloned via payload.map (never object-spread, which corrupts an array)"
    - "Hand-rolled cookie codec (zero new runtime deps) with hardened CHIPS Set-Cookie floors"

key-files:
  created:
    - packages/core/src/auth-helpers.ts
    - packages/core/src/cookie-codec.ts
    - packages/core/src/types.ts
    - packages/core/src/__tests__/auth-helpers.test.ts
    - packages/core/src/__tests__/helpers.ts
  modified:
    - packages/core/src/transfer-store/types.ts
    - packages/core/src/transfer-store/__tests__/contract.ts
    - packages/core/src/transfer-store/__tests__/in-memory.test.ts
    - packages/core/src/transfer-store/__tests__/kv.test.ts

key-decisions:
  - "harvestSessionChunks lives in cookie-codec.ts (NOT inline in the bridge) — Wave 2 imports it from there"
  - "TransferPayload is the bare Array<{name,value}> (RESEARCH Open Q3) — no wrapper object, no discriminator-mistakable field"
  - "index.ts barrel NOT extended this plan — helpers stay separately importable (D-11); barrel extension belongs with the factory in a later wave"
  - "AuthBridgeOptions.allowedOrigins typed readonly string[] to accept a frozen config (D-12)"

patterns-established:
  - "Pure helper module convention extended from Phase 1 generate-code.ts to auth-helpers.ts and cookie-codec.ts"
  - "Builder-function test fixtures (makeRequest/fakeVerifySession/makeTestStore) in the Phase 1 fake-fixture style, no classes"

requirements-completed: [ROUTE-06]

# Metrics
duration: 4min
completed: 2026-06-06
---

# Phase 2 Plan 01: Wave-1 Foundation (TransferPayload reshape, auth-helpers, cookie codec, types, fixtures) Summary

**Reshaped TransferPayload to a chunk array (D-01), shipped sanitizeNext + getAuthCookieName with full THREAT-08/D-16 negative coverage, and stood up the hand-rolled cookie codec, route/option types, and shared test fixtures the Wave 2/3 route handlers depend on.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-06T23:54:30Z
- **Completed:** 2026-06-06T23:58:44Z
- **Tasks:** 3
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments

- **TransferPayload finalized** as `Array<{ name: string; value: string }>` (D-01) — captures every Auth.js session-token chunk by construction; zero `authCookieValue` references remain in `src/`. The three Phase 1 fixtures (contract + in-memory + kv) were repaired to the array shape, including replacing the `Object.keys === ["authCookieValue"]` discriminator assertion with a per-entry `name`+`value`-only check that preserves the STORE-01 mode-agnostic forward-compat invariant.
- **`sanitizeNext` + `getAuthCookieName`** shipped as pure, separately-importable functions (D-11) with full ROUTE-06/THREAT-08 negative coverage: every unsafe target (`/auth*`, `/api/auth*`, absolute, protocol-relative `//evil`, non-leading-slash) degrades to `/` and the attacker target is never honored; getAuthCookieName resolves the `__Secure-` default, the non-prefixed name under `secure:false`, and an explicit `cookieName` override (D-16).
- **`cookie-codec.ts`** — hand-rolled `parseCookieHeader` (name=value only, D-03), `harvestSessionChunks` (exact base + `.N` integer-suffix match, never sweeps csrf/pkce/state — D-05), and `serializeSetCookie` (hardened CHIPS floors; `Max-Age` only when explicit — D-17). Zero new runtime dependencies.
- **Top-level `types.ts`** — `AuthBridgeOptions` + `VerifySession`, structurally typed with NO vendor Auth.js import (D-04); required `store`/`verifySession`/`allowedOrigins`, optional `cookieName`/`secure`/`maxAge`, each JSDoc-tagged with its D-NN.
- **Shared test fixtures** — `makeRequest`, `fakeVerifySession`, `makeTestStore` (in-memory only, no KV on the bench), all builder functions, no classes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reshape TransferPayload + repair Phase 1 fixtures** - `34a7b1a` (refactor)
2. **Task 2: auth-helpers (sanitizeNext + getAuthCookieName) — TDD** - `d1a881e` (test, RED) → `0e8c1dc` (feat, GREEN)
3. **Task 3: Cookie codec, route/option types, shared fixtures** - `559deb1` (feat)

_Task 2 was a TDD task: failing test committed first (RED), then the minimal implementation (GREEN). No separate refactor commit was needed — the GREEN implementation was already minimal and clean._

## Files Created/Modified

Created:
- `packages/core/src/auth-helpers.ts` - `sanitizeNext` (open-redirect control) + `getAuthCookieName` (cookie-name resolution), pure bare exports
- `packages/core/src/cookie-codec.ts` - `parseCookieHeader`, `harvestSessionChunks`, `serializeSetCookie` (hand-rolled, zero-dep)
- `packages/core/src/types.ts` - `AuthBridgeOptions`, `VerifySession` (structural, version-agnostic)
- `packages/core/src/__tests__/auth-helpers.test.ts` - ROUTE-06/THREAT-08 + D-16 unit tests (12 cases)
- `packages/core/src/__tests__/helpers.ts` - shared `makeRequest`, `fakeVerifySession`, `makeTestStore` fixtures

Modified:
- `packages/core/src/transfer-store/types.ts` - `TransferPayload` reshaped to `Array<{name,value}>` (D-01); JSDoc finalized
- `packages/core/src/transfer-store/__tests__/contract.ts` - array fixture + non-corrupting clone + per-entry key assertion
- `packages/core/src/transfer-store/__tests__/in-memory.test.ts` - array fixture + clone
- `packages/core/src/transfer-store/__tests__/kv.test.ts` - array fixtures + clone + structural round-trip assertions

## Decisions Made

- **`harvestSessionChunks` lives in `cookie-codec.ts`** (not inline in the bridge) — the plan's `<output>` asked Wave 2 to be told where it lives. Wave 2's bridge handler imports it from `cookie-codec.ts`. Rationale: keeps the chunk-harvest correctness in one auditable, separately-testable place alongside the parse/serialize codec.
- **`TransferPayload` is the bare `Array<{name,value}>`** (RESEARCH Open Q3) rather than a `{ cookies: [...] }` wrapper — the most literal read of D-01, and it carries no field that could be mistaken for a transport discriminator (STORE-01 forward-compat preserved).
- **`index.ts` barrel NOT extended this plan** — the new types/codec/helpers are not added to the public barrel yet. Helpers stay separately importable (D-11); the barrel extension (`createAuthBridge`, helper re-exports) belongs with the factory in a later wave. This keeps plan 02-01 within its stated `files_modified` scope.
- **`allowedOrigins` typed `readonly string[]`** so a frozen/`as const` config is accepted (D-12).

## Deviations from Plan

None - plan executed exactly as written. (Task 2's REFACTOR gate produced no commit because the GREEN implementation was already minimal — this is the expected TDD outcome, not a deviation.)

## Issues Encountered

None. All three repaired Phase 1 test files and the new auth-helpers tests passed on first run after implementation; `tsc --noEmit` was clean throughout under `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.

## User Setup Required

None - no external service configuration required. This plan adds zero new runtime dependencies (hand-rolled codec, structural typing).

## Next Phase Readiness

Wave 2/3 have everything they import:
- `TransferPayload` is the finalized chunk-array shape — the bridge can build the payload and consume can re-set each chunk.
- `sanitizeNext` / `getAuthCookieName` are importable from `auth-helpers.ts`.
- `parseCookieHeader`, `harvestSessionChunks`, `serializeSetCookie` are importable from `cookie-codec.ts`.
- `AuthBridgeOptions` / `VerifySession` are importable from `types.ts`.
- `makeRequest`, `fakeVerifySession`, `makeTestStore` are importable from `__tests__/helpers.ts` for the route tests.

No blockers. Full `pnpm test` (38 tests, 4 files) and `pnpm exec tsc --noEmit` are green.

## TDD Gate Compliance

Task 2 (`tdd="true"`) followed the RED → GREEN sequence with both gate commits present in the log: `d1a881e` (test, RED — failed on the missing module) → `0e8c1dc` (feat, GREEN — 12/12 pass). REFACTOR produced no commit (implementation already minimal). Gate sequence satisfied.

## Self-Check: PASSED

Created files verified present on disk; all task commit hashes verified in git log (see below).

---
*Phase: 02-bridge-consume-routes*
*Completed: 2026-06-06*
