---
phase: 03-client-helpers-pages-middleware
plan: 01
subsystem: auth
tags: [postMessage, iframe-detection, security-predicate, dependency-injection, vitest]

# Dependency graph
requires:
  - phase: 02-bridge-consume-routes
    provides: AuthBridgeOptions.allowedOrigins (readonly string[]) — the one source of truth the isTrustedMessage allowlist type matches
provides:
  - isTrustedMessage pure predicate (origin allowlist AND strict source identity — THREAT-03 trust gate)
  - detectContext open-union client context detector (iframe/browser, cross-origin-throw → iframe)
  - BridgeContext open union type (iframe | browser | pwa-shell) + routeForContext default-fallback helper
  - shared client DI fakes in __tests__/helpers.ts (fake window/popup/open/message-bus/opener/clock) for Wave 2/3
affects: [03-02, 03-03, 03-04, openAuthPopup, runPopupFlow, createBridgeMiddleware]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure security predicate extracted DOM-free: local structural MessageEventLike, no DOM lib, zero globals"
    - "Open-union with if/else default-fallback (never exhaustive switch / never-assertion) for forward-compat"
    - "Injected-default browser-global seam (win = globalThis) mirroring the store's injected now=Date.now clock"
    - "All Phase 3 client DI fakes centralized in one __tests__/helpers.ts to avoid cross-plan file conflicts"

key-files:
  created:
    - packages/core/src/is-trusted-message.ts
    - packages/core/src/detect-context.ts
    - packages/core/src/__tests__/is-trusted-message.test.ts
    - packages/core/src/__tests__/detect-context.test.ts
  modified:
    - packages/core/src/__tests__/helpers.ts

key-decisions:
  - "isTrustedMessage requires BOTH origin allowlist membership AND strict === source identity; either alone is insufficient (origin-only lets a same-origin window race the channel)"
  - "BridgeContext is intentionally wide/open (includes pwa-shell never returned in v0.1); consumers default unknown members rather than exhaustively switching"
  - "detectContext default win uses globalThis (not the DOM `window` global) so the module needs no DOM lib under tsconfig lib:[ES2022]"
  - "Test window fakes are cast through Parameters<typeof detectContext>[0], never the DOM Window type, keeping the suite pure-Node"

patterns-established:
  - "Pure trust predicate: structural input type + readonly string[] allowlist matching AuthBridgeOptions exactly"
  - "Open-union default-fallback proven testably via routeForContext routing an unknown member to the safe default"
  - "Deterministic clock/timer fake (now/setTimeout/advance) so popup close-poll/timeout runs with no real waits"

requirements-completed: [CLIENT-02, CLIENT-03]

# Metrics
duration: ~10min
completed: 2026-06-08
---

# Phase 3 Plan 01: Client Leaf Helpers + DI Fakes Summary

**isTrustedMessage (origin+source THREAT-03 trust gate) and detectContext (open-union iframe/browser detector) shipped as pure, DOM-free leaf functions, plus the shared client DI-fake test helpers (window/popup/open/message-bus/opener/clock) unblocking Wave 2/3.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-08
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 extended)

## Accomplishments
- `isTrustedMessage(event, { allowedOrigins, expectedSource })` — returns true ONLY when origin is allow-listed AND source identity matches strictly; both THREAT-03 negatives (wrong-origin, wrong-source) covered with zero DOM
- `detectContext(win = globalThis)` — returns the open-union member for iframe (incl. cross-origin top-throw) and browser; `routeForContext` proves an unknown future member falls through to the safe default with no throw and no type error
- `BridgeContext` exported as an intentionally wide open union (`iframe | browser | pwa-shell`)
- Extended `__tests__/helpers.ts` with six DI-fake builders for the popup flow; full existing suite stays green (no regression), no DOM runtime dependency added

## Task Commits

1. **Task 1: isTrustedMessage pure predicate (THREAT-03)** — `ae4284c` (feat, TDD: RED test then GREEN impl in one commit)
2. **Task 2: detectContext open-union client detector (CLIENT-03)** — `7a93d0c` (feat, TDD)
3. **Task 3: shared DI-fake test helpers for Wave 2/3** — `b92f576` (test)

_Note: TDD tasks 1 and 2 were authored RED-first (failing test confirmed module-missing) then driven GREEN; each landed as a single atomic feat commit covering test + implementation._

## Files Created/Modified
- `packages/core/src/is-trusted-message.ts` — `isTrustedMessage` predicate + local `MessageEventLike` type; self-contained doc comment, no internal IDs
- `packages/core/src/detect-context.ts` — `detectContext`, `BridgeContext` open union, `routeForContext` default-fallback; local `WindowLike`, no DOM lib, no switch
- `packages/core/src/__tests__/is-trusted-message.test.ts` — 5 cases (valid, wrong-origin, wrong-source, empty allowlist, strict-identity); pure-Node
- `packages/core/src/__tests__/detect-context.test.ts` — 6 cases (iframe, browser, cross-origin-throw, routeForContext known/unknown)
- `packages/core/src/__tests__/helpers.ts` — added makeFakeWindow / makeFakePopup / makeFakeOpen / makeFakeMessageBus / makeFakeOpener / makeFakeClock; existing makeRequest / fakeVerifySession / makeTestStore untouched

## Decisions Made
- Both-checks-required for isTrustedMessage (origin allowlist AND strict source identity) — origin alone would allow a same-origin racer to forge the bearer handle.
- `detectContext` default uses `globalThis` rather than the DOM `window` global, since the package's tsconfig has `lib: ["ES2022"]` with no DOM lib; this keeps the module DOM-free while still defaulting to the ambient window in a browser.
- Test window fakes cast through `Parameters<typeof detectContext>[0]` (the un-exported structural `WindowLike`) instead of the DOM `Window` type, so the suite typechecks under the DOM-free lib config.

## Deviations from Plan

None - plan executed exactly as written. (The `globalThis` default and the `Parameters<...>` test cast are the in-plan realization of the explicit "do NOT import a DOM `Window`/`window`" constraint under the package's `lib: ["ES2022"]` tsconfig — not a scope change.)

## Issues Encountered
- The worktree had no installed `node_modules` initially (`vitest: command not found`); resolved by running `pnpm install` once. No code impact.
- Under `lib: ["ES2022"]` the DOM `Window`/`window` globals are unavailable to the type checker. Resolved in-plan by defaulting `detectContext` to `globalThis` and casting test fakes via `Parameters<typeof detectContext>[0]` — both honoring the plan's DOM-free mandate. Full `tsc --noEmit` is clean.

## Threat Surface
THREAT-03 (Spoofing — sender validation) is mitigated exactly as the plan's threat register specifies: `isTrustedMessage` requires BOTH `event.origin ∈ allowedOrigins` AND `event.source === expectedSource`, asserted by the wrong-origin and wrong-source zero-DOM negative tests. `detectContext` introduces no security decision (UX-only; the open-union default-fallback is the accepted safe failure). No new security surface beyond the plan's threat model.

## Next Phase Readiness
- Wave 2/3 (03-02 / 03-03 / 03-04) can import `isTrustedMessage`, `detectContext`, `BridgeContext`, and all six DI fakes from one place.
- Full `packages/core` suite: 8 files / 72 tests green; `tsc --noEmit` clean. No blockers.

## Self-Check: PASSED

All 6 claimed files exist on disk; all 4 commits (ae4284c, 7a93d0c, b92f576, ecd1472) exist in git history. Full suite (8 files / 72 tests) green; `tsc --noEmit` clean.

---
*Phase: 03-client-helpers-pages-middleware*
*Completed: 2026-06-08*
