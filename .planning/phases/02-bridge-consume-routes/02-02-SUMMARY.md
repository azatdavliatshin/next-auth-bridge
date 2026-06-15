---
phase: 02-bridge-consume-routes
plan: 02
subsystem: auth
tags: [auth.js, bridge-route, session-gate, chunk-harvest, pkce-non-interference, opaque-handle, vitest, fetch-api]

# Dependency graph
requires:
  - phase: 02-bridge-consume-routes
    plan: 01
    provides: TransferPayload chunk-array (D-01), harvestSessionChunks + parseCookieHeader (cookie-codec.ts), getAuthCookieName (auth-helpers.ts), AuthBridgeOptions + VerifySession (types.ts), makeRequest/fakeVerifySession/makeTestStore fixtures
provides:
  - createBridgeHandler(options) => (request: Request) => Promise<Response> — the /auth/bridge handler builder (D-06)
  - Security gate ordering: Origin (D-12/D-14) -> verifySession (ROUTE-01/THREAT-04) -> harvest (D-05) -> empty-harvest guard (D-15) -> store.create -> 200 { code } (ROUTE-02/AM-2)
  - Full bridge negative suite (THREAT-04/05, ROUTE-01/02/04, D-05, D-12/D-14, D-15, AM-2)
affects: [consume-route, create-auth-bridge, phase-02-wave-3, phase-04-threat-model]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory-closure route handler (D-06): createBridgeHandler(options) returns a plain Web-standard (request) => Promise<Response>; no Next.js runtime coupling, driven directly on the Vitest bench"
    - "Security gate ordering encoded in source order with each step commented by its decision/threat ID (mirrors in-memory.ts consume() delete-FIRST discipline)"
    - "Recording-store test wrapper to assert store.create is NEVER reached on the refusal/empty-harvest paths (proves the gate, not just the outcome)"

key-files:
  created:
    - packages/core/src/bridge-route.ts
    - packages/core/src/__tests__/bridge-route.test.ts
  modified: []

key-decisions:
  - "Origin-disallowed status is 403 and empty-harvest status is 500 — concrete picks inside the plan's 4xx/5xx bands; tests assert the band (>=400/<500, >=500/<600), not the exact code, so the contract is the band"
  - "docs/threat-model.md NOT created this plan — it does not yet exist in the repo and is outside this plan's files_modified scope; THREAT-NN traceability is delivered via the tagged negative tests (the enforceable half of the policy). Doc creation deferred to Phase 4 (phase-04-threat-model)"
  - "No vendor Auth.js type imported (D-04) — the only 'next-auth' textual hit in bridge-route.ts is the package-name comment header"

patterns-established:
  - "Route-handler builder convention: decision-citing module header, factory returning a single async closure, inline per-step threat/decision comments"
  - "Recording-store fixture for create-never-reached assertions on refusal paths"

requirements-completed: [ROUTE-01, ROUTE-02, ROUTE-04]

# Metrics
duration: 3min
completed: 2026-06-07
---

# Phase 2 Plan 02: Bridge Route Handler (session gate, chunk harvest, opaque-handle response) Summary

**Shipped `createBridgeHandler` — the security-critical `/auth/bridge` builder that mints a one-time opaque handle ONLY after a verified session, harvests ONLY session-token chunks (PKCE/state/csrf decoys excluded), and returns `200 { code }` with zero cookies — backed by a full THREAT-04/05-tagged negative suite.**

## Performance

- **Duration:** ~3 min
- **Tasks:** 2
- **Files modified:** 2 (2 created, 0 modified)

## Accomplishments

- **`createBridgeHandler(options): (request: Request) => Promise<Response>`** (D-06) — a plain Web-standard closure, no Next.js coupling. The gate executes in this exact, source-ordered, per-step-commented sequence:
  1. **Origin check (D-12/D-14)** — present-but-disallowed → `403`; absent → passthrough (a same-origin GET legitimately carries no Origin). Documented inline as defense-in-depth, NOT the boundary.
  2. **Session gate (ROUTE-01/THREAT-04)** — `await verifySession()`; falsy → `401` no body. NEVER branched on a wrapper/context signal.
  3. **Prefix resolution** — `getAuthCookieName({ cookieName, secure })` (threads D-16).
  4. **Harvest (D-05)** — `harvestSessionChunks` selects only the session-token base + `.N` chunks; csrf/pkce/state/callback-url decoys excluded by construction.
  5. **Empty-harvest guard (D-15)** — zero chunks → `500`, `store.create` NOT called (a cookie-name mismatch fails loud, not a benign mint).
  6. **Mint** — `store.create(harvested)` reached ONLY after a verified session AND a non-empty harvest.
  7. **Respond (ROUTE-02/AM-2)** — `200` JSON `{ code }`, opaque 64-hex handle in the body only, ZERO `Set-Cookie` headers.
- **Full negative suite (7 cases)** in the in-memory.test.ts convention, each tagged with its THREAT/decision ID:
  - no-session → `401` + `store.create` never reached + `getSetCookie() === []` (THREAT-04)
  - wrapper signal (`?popup=true`) without session → still `401` (THREAT-04 — context never gates the mint)
  - success → `200 { code }`, `/^[0-9a-f]{64}$/`, no `authjs.session-token` substring, no JWT-shaped string, `getSetCookie() === []` (ROUTE-02/AM-2)
  - decoy exclusion → consume the minted code and assert the payload names are EXACTLY the base + `.0` + `.1`, no decoy present (D-05/ROUTE-04/THREAT-05)
  - empty harvest → `5xx` + create never called (D-15/T-02-15)
  - Origin pair → present-but-disallowed `4xx`; absent `200` (D-12/D-14)

## Task Commits

1. **Task 1: Bridge handler builder** — `5cdf322` (feat)
2. **Task 2: Bridge negative-test suite** — `6898b64` (test)

_Both tasks are `tdd="true"`. The plan deliberately splits implementation (Task 1, verified by `tsc`) from the behavioral suite (Task 2, RED/GREEN). Because Task 1's minimal implementation already exists when Task 2's tests run, the suite passed on first run (7/7) — the expected outcome for this plan's split, not a skipped RED gate._

## Files Created/Modified

Created:
- `packages/core/src/bridge-route.ts` — `createBridgeHandler` factory-closure handler (40+ lines, decision-citing header, per-step gate comments)
- `packages/core/src/__tests__/bridge-route.test.ts` — 7-case negative suite (THREAT-04/05, ROUTE-01/02/04, D-05, D-12/D-14, D-15, AM-2)

## Decisions Made

- **Concrete status codes inside the plan's bands:** Origin-disallowed → `403` (within the 4xx contract), empty-harvest → `500` (within the 5xx contract). The tests assert the *band* (`>=400 && <500`, `>=500 && <600`), so the externally-observable contract is the band, leaving the exact code free to tune.
- **`docs/threat-model.md` not created this plan** — see Deviations / Deferred below.
- **No Auth.js vendor type imported (D-04):** verified — the only `next-auth` textual match in `bridge-route.ts` is the package-name comment header.

## Deviations from Plan

None to the implementation — both tasks executed exactly as written, all acceptance criteria met.

### Deferred (out of this plan's `files_modified` scope)

- **`docs/threat-model.md` update.** CLAUDE.md policy states a bridge-route change requires a corresponding `docs/threat-model.md` update *and* a negative test. The negative-test half is fully delivered (THREAT-04/05/09, T-02-12/15 each have an asserting, tagged case). The doc itself does **not yet exist** in the repo, and this plan's `files_modified` frontmatter scopes to `bridge-route.ts` + its test only. The plan embeds the canonical STRIDE register inline in its `<threat_model>` block. Creating `docs/threat-model.md` from scratch is owned by Phase 4 (`phase-04-threat-model`, per the dependency graph). Logged here for that phase to pick up; not auto-created to avoid scope expansion past the plan's stated files.

## Issues Encountered

None. `tsc --noEmit` clean under `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` throughout; the bridge suite (7/7) and the full package suite (45 tests, 5 files) green.

## User Setup Required

None — zero new runtime dependencies (structural typing, reuse of the Wave-1 hand-rolled codec).

## Next Phase Readiness

Wave 3 (the `createAuthBridge` factory + the consume route) has its bridge half:
- **`createBridgeHandler(options: AuthBridgeOptions) => (request: Request) => Promise<Response>`** is importable from `packages/core/src/bridge-route.ts`. The Wave-3 factory captures one `AuthBridgeOptions` and returns `{ bridge: createBridgeHandler(opts), consume: ... }`.
- The bridge writes the `Array<{name,value}>` payload via `store.create`; the consume route (Wave 3) re-sets each chunk via `serializeSetCookie` (already shipped in Wave 1).

No blockers.

## TDD Gate Compliance

Both tasks carry `tdd="true"`. The plan structures the cycle across the two tasks: Task 1 ships the minimal implementation (gate: `tsc` clean), Task 2 ships the behavioral negative suite. The suite passed on first run because Task 1's implementation is already minimal and correct — the GREEN state for this split. No unexpected pass during a RED phase occurred (Task 2 is the first behavioral test of this module; Task 1's verify is typecheck-only by plan design). Gate intent satisfied.

## Self-Check: PASSED

Created files verified present; both task commit hashes verified in git log.

---
*Phase: 02-bridge-consume-routes*
*Completed: 2026-06-07*
