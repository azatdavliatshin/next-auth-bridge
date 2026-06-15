---
phase: 02-bridge-consume-routes
plan: 03
subsystem: auth
tags: [auth.js, consume-route, chips, partitioned-cookie, one-time-handle, open-redirect, factory, vitest, fetch-api]

# Dependency graph
requires:
  - phase: 02-bridge-consume-routes
    plan: 01
    provides: TransferPayload chunk-array (D-01), serializeSetCookie + harvestSessionChunks (cookie-codec.ts), sanitizeNext + getAuthCookieName (auth-helpers.ts), AuthBridgeOptions + VerifySession (types.ts), makeRequest/fakeVerifySession/makeTestStore fixtures
  - phase: 02-bridge-consume-routes
    plan: 02
    provides: createBridgeHandler(options) => (request) => Promise<Response> (bridge-route.ts)
provides:
  - createConsumeHandler(options) => (request: Request) => Promise<Response> — the /auth/consume handle-exchange handler (ROUTE-03)
  - Factored partitioned cookie-writer (D-13) — one Set-Cookie per chunk, hardened CHIPS floors, threaded maxAge (D-17)
  - createAuthBridge(options) => { bridge, consume } — the single config factory wiring both routes from one shared options (ROUTE-05/D-10)
  - Extended public surface (index.ts): createAuthBridge, getAuthCookieName, sanitizeNext, AuthBridgeOptions, VerifySession
  - Full consume negative suite + factory wiring suite (THREAT-06 forgery+replay, AM-1, ROUTE-06, D-17, D-12/D-14, D-10/D-11)
affects: [phase-03-client-flow, phase-04-threat-model, phase-05-example-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory-closure route handler (D-06): createConsumeHandler(options) returns a plain Web-standard (request) => Promise<Response>; no Next.js coupling, driven directly on the Vitest bench"
    - "Factored internal cookie-writer (D-13): writeChunkCookies(headers, payload, { maxAge }) takes the attribute set as input so the v0.2 non-partitioned PWA path is additive, not a route reshape"
    - "Single config factory returning { bridge, consume } from one shared options object — no double instantiation (D-10), helpers stay off the return (D-11)"
    - "Recording-store test wrapper asserting store.consume is NEVER reached on the absent/empty-code path (proves the AM-1 guard, not just the outcome) + survivor-code check proving nothing was consumed"

key-files:
  created:
    - packages/core/src/consume-route.ts
    - packages/core/src/create-auth-bridge.ts
    - packages/core/src/__tests__/consume-route.test.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "Consume bad-handle code is 400 (reserving 401 for the bridge no-session refusal per D-07) — keeps the three failure modes separable; tests assert the 4xx band (>=400/<500), not the exact code"
  - "The cookie-writer is factored as a module-internal writeChunkCookies(headers, payload, {maxAge}) helper that takes the attribute set as input (D-13) — v0.2's non-partitioned PWA path adds a different attribute set without touching the route body"
  - "A thrown store error is NOT caught in consume — it propagates as an operational 5xx (Phase 1 D-13), distinct from the 4xx bad-handle path"
  - "docs/threat-model.md NOT created this plan — it still does not exist in the repo and is outside this plan's files_modified scope (consistent with Plan 02-02's deferral); THREAT-06/AM-1/CHIPS traceability is delivered via the tagged negative tests. Doc creation owned by Phase 4 (phase-04-threat-model)"

patterns-established:
  - "Factored attribute-set cookie-writer convention for the additive v0.2 PWA cookie path"
  - "Single createAuthBridge factory wiring point that the Phase 3 client flow and Phase 5 example app consume"

requirements-completed: [ROUTE-03, ROUTE-05]

# Metrics
duration: 3min
completed: 2026-06-07
---

# Phase 2 Plan 03: Consume Route + createAuthBridge Factory (handle exchange, partitioned cookie-writer, public surface) Summary

**Shipped `createConsumeHandler` — the other half of the security-critical handoff: it exchanges a one-time opaque handle via `store.consume`, re-sets each stored chunk as a hardened CHIPS-partitioned cookie through a factored writer, and `302`s to a `sanitizeNext`-validated target; forged/replayed/absent/empty handles all reject `4xx` no-cookie with the store never reached on absent/empty — then wired both routes through the single `createAuthBridge` factory and extended the public surface.**

## Performance

- **Duration:** ~3 min
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- **`createConsumeHandler(options): (request: Request) => Promise<Response>`** (ROUTE-03 / D-06) — a plain Web-standard closure, no Next.js coupling. The gate executes in this exact, source-ordered, per-step-commented sequence:
  1. **Origin check (D-12/D-14)** — present-but-disallowed → `4xx` (store NOT reached); absent → passthrough. Documented inline as defense-in-depth, NOT the boundary.
  2. **AM-1 guard** — absent or empty `code` → the SAME `4xx` no-cookie rejection, run textually BEFORE `store.consume`, so no null/empty argument ever reaches the store (no oracle, no malformed-input crash).
  3. **Exchange (THREAT-06)** — `store.consume(code)`; `null` (forged/expired/already-consumed all collapse — Phase 1 D-03) → `4xx` no-cookie. A thrown store error propagates as an operational `5xx` (NOT caught).
  4. **Redirect (D-09/ROUTE-06)** — `sanitizeNext(next)` degrades an unsafe target to `/`; the attacker target is never honored.
  5. **Factored partitioned cookie-writer (D-13)** — `writeChunkCookies(headers, payload, { maxAge })` appends ONE `Set-Cookie` per chunk via `Headers.append` (never comma-joined), each carrying the hardened CHIPS floors `Secure; HttpOnly; SameSite=None; Path=/; Partitioned` and the optional `Max-Age` (D-17).
  6. **Respond (D-08)** — `302` to the sanitized `Location`. NO `mode` parameter and NO PWA branch (D-13 — popup-only for v0.1).
- **`createAuthBridge(options): { bridge, consume }`** (ROUTE-05 / D-10) — the single wiring point. It constructs `createBridgeHandler(options)` and `createConsumeHandler(options)` over ONE shared options object and returns exactly `{ bridge, consume }`. The helpers `getAuthCookieName` / `sanitizeNext` are deliberately absent from the return (D-11).
- **Extended public surface (`index.ts`)** — added `createAuthBridge`, the separately-importable helpers `getAuthCookieName` / `sanitizeNext`, and the wiring types `AuthBridgeOptions` / `VerifySession`. The KV adapter stays behind the `./store/kv` subpath (D-11) — not re-exported from the main entry.
- **Full negative + wiring suite (14 cases)** in the bridge-route.test.ts convention, each tagged with its THREAT/decision ID:
  - valid handle → `302`, one `Set-Cookie` per stored chunk asserted to contain `Partitioned`/`Secure`/`HttpOnly`/`SameSite=None`/`Path=/`, chunk names/values match the payload (ROUTE-03/CHIPS)
  - forged handle → `4xx`, `getSetCookie() === []` (THREAT-06 forgery)
  - already-consumed (consume twice) → second `4xx`, `[]` (THREAT-06 replay)
  - absent `code` and empty `?code=` → `4xx`, `[]`, `store.consume` NOT reached (recording wrapper + survivor-code still consumable) (AM-1)
  - unsafe `next` (`/auth/x`, `//evil`, `/api/auth/signin`) on a valid handle → `Location: /` (ROUTE-06)
  - default omits `Max-Age`; `maxAge: 600` → every `Set-Cookie` carries `Max-Age=600` (D-17)
  - present-but-disallowed Origin → `4xx`, store not reached; absent Origin → `302` (D-12/D-14)
  - factory: returns exactly `{ bridge, consume }`; helpers NOT on the return but importable from the root (D-11); end-to-end factory bridge → factory consume round-trips the exact chunks as partitioned cookies (D-10); shared-config one-time-use + Origin enforcement

## Task Commits

1. **Task 1: Consume handler builder** — `3d2e990` (feat)
2. **Task 2: Consume negative suite + createAuthBridge factory + extended re-exports** — `73cb2f7` (test)

_Both tasks carry `tdd="true"`. The plan splits implementation (Task 1, verified by `tsc --noEmit`) from the behavioral suite + wiring (Task 2). Because Task 1's minimal implementation already exists when Task 2's tests run, the suite passed on first run (14/14) — the expected GREEN state for this split, not a skipped RED gate._

## Files Created/Modified

Created:
- `packages/core/src/consume-route.ts` — `createConsumeHandler` factory-closure handler + factored `writeChunkCookies` (decision-citing header, per-step gate comments)
- `packages/core/src/create-auth-bridge.ts` — `createAuthBridge` single config factory returning `{ bridge, consume }` (ROUTE-05/D-10)
- `packages/core/src/__tests__/consume-route.test.ts` — 14-case consume + factory-wiring suite (THREAT-06, AM-1, ROUTE-03/06, D-17, D-12/D-14, D-10/D-11)

Modified:
- `packages/core/src/index.ts` — re-exported `createAuthBridge`, `getAuthCookieName`, `sanitizeNext`, `AuthBridgeOptions`, `VerifySession`; KV adapter kept subpath-only (D-11)

## Symbols produced for the Phase 3 consumer

- `createAuthBridge(options: AuthBridgeOptions) => { bridge, consume }` — re-exported from the package root. The Phase 3 client flow / Phase 5 example app build ONE options object and re-export the handlers from App Router `route.ts`.
- `createConsumeHandler(options) => (request) => Promise<Response>` — importable from `consume-route.ts` (also reachable via the factory's `consume`).
- `createBridgeHandler(options) => (request) => Promise<Response>` — from Plan 02-02 (`bridge-route.ts`), composed by the factory's `bridge`.
- `getAuthCookieName`, `sanitizeNext` — separately importable from the package root (D-11).
- `AuthBridgeOptions`, `VerifySession` types — re-exported from the package root.
- `TransferStore`, `TransferPayload`, `TransferStoreOptions`, `createInMemoryTransferStore` — pre-existing root exports (KV adapter stays behind `./store/kv`).

## Decisions Made

- **Consume bad-handle code is `400`** (reserving `401` for the bridge no-session refusal, D-07; `5xx` for an operational store throw, Phase 1 D-13) — the three failure modes stay separable. Tests assert the `4xx` band (`>=400 && <500`), so the externally-observable contract is the band.
- **The cookie-writer is factored** as a module-internal `writeChunkCookies(headers, payload, { maxAge })` that takes the attribute inputs as a parameter (D-13). v0.2's regular (non-partitioned) PWA cookie path becomes an additive attribute-set change, not a route reshape.
- **A thrown store error is NOT caught** in consume — it propagates as an operational `5xx`, distinct from the `4xx` bad-handle path (Phase 1 D-13).
- **`docs/threat-model.md` not created this plan** — see Deviations / Deferred below.

## Deviations from Plan

None — both tasks executed exactly as written, all acceptance criteria met.

### Deferred (out of this plan's `files_modified` scope)

- **`docs/threat-model.md` update.** CLAUDE.md policy states a change touching the consume route / cookie-attribute setting requires a corresponding `docs/threat-model.md` update *and* a negative test. The negative-test half is fully delivered (THREAT-06 forgery + replay, AM-1, ROUTE-06, D-12/D-14 each have an asserting, tagged case). The doc itself still does **not exist** in the repo, and this plan's `files_modified` frontmatter scopes to the four route/test/factory files only. The plan embeds the canonical STRIDE register inline in its `<threat_model>` block. Creating `docs/threat-model.md` from scratch is owned by Phase 4 (`phase-04-threat-model`, per the dependency graph) — consistent with Plan 02-02's identical deferral. Logged here for that phase to pick up; not auto-created to avoid scope expansion past the plan's stated files.

## Threat-model coverage delivered (for Phase 4 mapping)

| Threat ID | Asserting test |
|-----------|----------------|
| THREAT-06 (forgery) | forged handle → `4xx` + empty `getSetCookie()` |
| THREAT-06 (replay) | consume-twice → second `4xx` + `[]` |
| T-02-AM1 | absent + empty `code` → `4xx` + `[]` + `store.consume` not reached (recording store + survivor code) |
| ROUTE-03 / CHIPS | valid handle → one partitioned Set-Cookie per chunk, all hardened floors asserted via `getSetCookie()` |
| T-02-08C | unsafe `next` on a valid handle → `Location: /` |
| T-02-12 (D-12/D-14) | present-but-disallowed Origin → `4xx` (store not reached); absent → proceeds |
| D-17 | default omits `Max-Age`; `maxAge:600` adds it to every chunk |

## Issues Encountered

None. `pnpm exec tsc --noEmit` clean under `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` throughout; the consume suite (14/14) and the full package suite (59 tests, 6 files) green on first run after implementation.

## User Setup Required

None — zero new runtime dependencies (reuse of the Wave-1 hand-rolled codec + helpers, structural typing).

## Next Phase Readiness

Phase 2 server-side handoff is complete. Phase 3 (the `/auth/popup` page, `openAuthPopup`, `detectContext`, middleware) has the full server surface it consumes:
- `createAuthBridge(options) => { bridge, consume }` is the single wiring point, re-exported from the package root.
- The bridge returns `200 { code }` (opaque 64-hex handle, no token in body/URL); the popup fetches it and drives `/auth/consume?code=…&next=…`, which `302`s with the partitioned session cookies set.
- `allowedOrigins` (D-12) is the server-side complement to the Phase 3 client `postMessage` origin checks (CLIENT-02).

No blockers.

## TDD Gate Compliance

Both tasks carry `tdd="true"`. The plan structures the cycle across the two tasks: Task 1 ships the minimal implementation (gate: `tsc --noEmit` clean), Task 2 ships the behavioral negative + wiring suite. The suite passed on first run (14/14) because Task 1's implementation is already minimal and correct — the GREEN state for this split. No unexpected pass during a RED phase occurred (Task 2 is the first behavioral test of this module). Gate intent satisfied.

## Self-Check: PASSED

Created files verified present on disk; both task commit hashes verified in git log (see below).

---
*Phase: 02-bridge-consume-routes*
*Completed: 2026-06-07*
