---
phase: 03-client-helpers-pages-middleware
plan: 03
subsystem: auth
tags: [postMessage, popup-flow, dependency-injection, typed-rejections, vitest]

# Dependency graph
requires:
  - phase: 03-client-helpers-pages-middleware
    plan: 01
    provides: isTrustedMessage (origin+source THREAT-03 trust gate) + MessageEventLike type + the shared client DI fakes (makeFakeOpen / makeFakePopup / makeFakeMessageBus / makeFakeClock)
provides:
  - openAuthPopup(deps) — opener-side promise orchestrator resolving { code } on a trusted auth-success message
  - OpenAuthPopupError + OpenAuthPopupFailureReason — typed, distinguishable rejection discriminant (auth-error | popup-blocked | popup-closed | timeout)
  - OpenAuthPopupDeps + PopupWindowLike — the injected-browser-dep surface (open / addMessageListener / clock-timer seam) with real-browser defaults
affects: [03-04, runPopupFlow, the embedded-app consumer that drives /auth/consume with the resolved code]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opener-side promise orchestrator: open() -> register listener -> resolve/reject with idempotent cleanup() on first settle (D-04 listener+poll+timeout teardown)"
    - "Typed rejection discriminant via an Error subclass carrying a readonly `reason` field so callers branch without string-matching"
    - "Repeating close-poll built on the one-shot injected timer seam (makeIntervalFromTimer re-arms after each tick) — no global setInterval, fully virtual-clock driven"
    - "Delegated trust: the origin+source THREAT-03 check is imported from is-trusted-message, never reimplemented; namespace + type discriminator layered on top"

key-files:
  created:
    - packages/core/src/open-auth-popup.ts
    - packages/core/src/__tests__/open-auth-popup.test.ts
  modified: []

key-decisions:
  - "Four distinguishable failure reasons (added popup-blocked alongside the plan's auth-error/popup-closed/timeout) — open() returning falsy is a real, distinct browser failure the embedded app must surface differently (popups blocked), so it earns its own reason rather than collapsing into timeout"
  - "Rejection carried as an OpenAuthPopupError subclass with a readonly `reason` discriminant — both instanceof and a stable machine-readable tag, tested via toMatchObject({ reason }) so the suite tells the modes apart without brittle message matching"
  - "Close-poll implemented as a re-arming one-shot timer (makeIntervalFromTimer) over deps.setTimer, mirroring the store's injected clock seam — keeps the module on a single timer primitive and drives deterministically via makeFakeClock.advance"
  - "popup-blocked rejects immediately before any listener/poll/timeout is registered, so the no-leak invariant holds trivially on that path (nothing to clean up)"

requirements-completed: [CLIENT-02]

# Metrics
duration: ~8min
completed: 2026-06-08
---

# Phase 3 Plan 03: openAuthPopup Opener-Side Handoff Helper Summary

**openAuthPopup(deps) — the receiver half of the Mode A popup handoff: opens /auth/popup, delegates the THREAT-03 origin+source check to 03-01's isTrustedMessage, resolves the { code } bearer handle only on a trusted, namespaced auth-success message, and rejects a typed OpenAuthPopupError (auth-error | popup-blocked | popup-closed | timeout) — tearing down listener + close-poll + timeout on every settle path, all DI-seamed with no DOM lib and no real timers.**

## Performance
- **Duration:** ~8 min
- **Completed:** 2026-06-08
- **Tasks:** 1 (TDD)
- **Files modified:** 2 (both created)

## Accomplishments
- `openAuthPopup(deps): Promise<{ code: string }>` — opens the popup via injected `open()`, captures the returned window as the `expectedSource` identity, registers a message listener, starts a close-poll and a timeout, and exposes the whole flow as a single awaitable.
- Security-critical receive sequence enforced in order: `isTrustedMessage` (origin allowlist AND `event.source === popupWin`) -> object shape guard -> namespace filter (`data.source === "next-auth-bridge"`) -> `type` discriminator. A message failing ANY check is ignored and never settles the flow.
- Typed rejections via `OpenAuthPopupError` with a readonly `reason` discriminant: `auth-error`, `popup-blocked`, `popup-closed`, `timeout` — callers branch on `reason` or `instanceof`.
- Idempotent `cleanup()` unsubscribes the listener and clears both the close-poll and the timeout exactly once on the first settle; asserted via the fake bus `unsubscribed` and clock `pending()` recorders on all four registered-resource settle paths.
- Colocated 9-case test: resolve, wrong-origin (then a later valid message still resolves), wrong-source racer, foreign-namespace, auth-error, popup-closed, timeout, popup-blocked, and a no-re-settle case — all driven by the 03-01 DI fakes and `makeFakeClock` with no real waits.

## Task Commits
1. **Task 1: openAuthPopup opener-side promise orchestrator (TDD)** — `ff0105d` (feat — test + implementation landed atomically; test authored against the missing module, then driven green)

## Files Created/Modified
- `packages/core/src/open-auth-popup.ts` — `openAuthPopup`, `OpenAuthPopupError`, `OpenAuthPopupFailureReason`, `OpenAuthPopupDeps`, `PopupWindowLike`; delegates the trust check to `./is-trusted-message`; injected `open` / `addMessageListener` / `setTimer` seams default to `globalThis`-derived implementations; self-contained doc comments, no internal requirement IDs, no React/.tsx.
- `packages/core/src/__tests__/open-auth-popup.test.ts` — 9 cases covering the resolve path, all THREAT-03 ignore paths, all four typed rejections, and cleanup-on-settle, using `makeFakeOpen` / `makeFakePopup` / `makeFakeMessageBus` / `makeFakeClock`.

## Decisions Made
- **Added a fourth reason `popup-blocked`** beyond the plan's three. The plan explicitly says "if `open` returns `null` — blocked popup — reject with a distinguishable reason" and leaves the discriminant design to discretion; a dedicated reason (vs. folding into timeout) lets the embedded app show a "popups are blocked" hint. This is the in-plan realization of the blocked-popup branch, not a scope addition.
- **`reason` discriminant on an Error subclass** rather than a tagged plain object, so callers get both `instanceof OpenAuthPopupError` and a stable `reason` string; tests assert via `toMatchObject({ reason })`.
- **Close-poll as a re-arming one-shot timer** over the single injected `setTimer` seam (no separate interval primitive), keeping the module on one timer surface that `makeFakeClock.advance` drives deterministically.

## Deviations from Plan
None - plan executed exactly as written. (The `popup-blocked` reason is the plan's explicit "reject with a distinguishable reason" for the `open()===null` branch; the rejection-discriminant design was left to discretion.)

## Issues Encountered
- The worktree had no installed `node_modules` initially (`vitest` binary missing, same as Wave 1); resolved by running `pnpm install` once. No code impact.
- ESLint/Prettier are not installed nor wired as a runnable script in this worktree (no root or package `lint` script, no eslint binary). The executable validation contract here is `pnpm test` + `tsc --noEmit` (both green) plus the acceptance-criteria token grep (clean); code follows the established Prettier-default style by hand.

## Threat Surface
THREAT-03 (Spoofing — sender validation, register IDs T-03-07/T-03-08) is mitigated by delegating the origin-allowlist + `event.source === popupWin` identity check to `isTrustedMessage`; the wrong-origin AND wrong-source negative tests prove the `{ code }` is never resolved from an untrusted sender, and the foreign-namespace test proves a same-origin/same-source but non-bridge message is also dropped. T-03-09 (listener/poll leak on settle) is mitigated by the idempotent `cleanup()` asserted on every settle path. No new security surface beyond the plan's threat register; no package installs this phase (T-03-SC accept).

## Known Stubs
None — `openAuthPopup` is fully wired (no hardcoded/placeholder data; the only defaults are real-browser global seams and tuning constants).

## Next Phase Readiness
- 03-04 (`createBridgeMiddleware` / `runPopupFlow`) and the embedded-app consumer can import `openAuthPopup`, `OpenAuthPopupError`, and `OpenAuthPopupFailureReason` to await the handle and then drive `/auth/consume`.
- Full `packages/core` suite: 9 files / 81 tests green; `tsc --noEmit` clean. No blockers.

## Self-Check: PASSED

Both created files exist on disk; commit `ff0105d` exists in git history. Targeted suite (9 tests) and full suite (9 files / 81 tests) green; `tsc --noEmit` clean; forbidden-token grep on shipped source returns nothing.

---
*Phase: 03-client-helpers-pages-middleware*
*Completed: 2026-06-08*
