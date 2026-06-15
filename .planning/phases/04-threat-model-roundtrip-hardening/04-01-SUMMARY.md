---
phase: 04-threat-model-roundtrip-hardening
plan: 01
subsystem: testing
tags: [vitest, roundtrip, e2e, threat-model, popup-bridge, chips, postMessage]

# Dependency graph
requires:
  - phase: 03-public-surface-wiring
    provides: openAuthPopup + runPopupFlow client helpers, isTrustedMessage predicate, helpers.ts DI fakes, the shipped roundtrip.e2e.test.ts
provides:
  - "Hardened canonical roundtrip test driving the REAL runPopupFlow + openAuthPopup via DI fakes (bridge handle crosses the real isTrustedMessage trust seam)"
  - "Roundtrip-level replay negative (second consume -> 4xx, zero cookies)"
  - "Roundtrip-level wrong-origin/mismatched-source non-resolution negative (sentinel-race), then valid message resolves"
  - "Preserved HARDEN-03 URL-hygiene sweep (no session token in any client-constructed URL; opaque code permitted in ?code=)"
  - "Three locked it() names for Plan 02 to cite in docs/threat-model.md"
  - "Header comments reconciled from T-03-NN to canonical THREAT-06/THREAT-07 (THREAT-10 noted)"
affects: [04-02, threat-model-doc, HARDEN-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real-helper-driven roundtrip: wrap a real route handler as a ResponseLike fakeFetch so runPopupFlow drives the REAL bridge; bridge the recorded opener.postMessage into openAuthPopup's bus via the SAME pinned popupWin source reference"
    - "Sentinel-race non-resolution assertion: Promise.race([promise.then(()=>\"resolved\"), Promise.resolve(sentinel)]) then expect(winner).toBe(sentinel)"
    - "Transport-agnostic consume bench: api.consume(makeRequest(...)) driven directly (NOT fetch-routed) — the 302 + Partitioned emission holds for either real-client transport (D-09)"

key-files:
  created: []
  modified:
    - packages/core/src/__tests__/roundtrip.e2e.test.ts

key-decisions:
  - "Kept the consume call and two impostor dispatches on single lines via // prettier-ignore (consume) / explicit wrapping so the api.consume(makeRequest acceptance grep matches while the file stays prettier-clean elsewhere"
  - "Left the happy-path it() string verbatim (including the '(simulated postMessage)' phrasing) because Plan 02 cites it; the body now drives the REAL helpers, only the title is held stable per the plan"

patterns-established:
  - "Pattern 1: Two-real-helpers handoff — runPopupFlow (popup) posts to a fake opener, that recorded message is dispatched into openAuthPopup's (opener) fake message bus carrying the pinned popupWin as MessageEvent source"
  - "Pattern 2: Pinned-identity invariant — makeFakeOpen(popupWin) makes the open() return value the SAME reference dispatched as event.source, so the REAL isTrustedMessage passes (distinct from data.source, the namespace string)"

requirements-completed: [HARDEN-02, HARDEN-03]

# Metrics
duration: ~7 min
completed: 2026-06-09
---

# Phase 4 Plan 01: Roundtrip Hardening Summary

**Hardened the canonical pure-Node roundtrip test in place so the bridge handle crosses popup -> opener through the REAL runPopupFlow + openAuthPopup helpers (real isTrustedMessage trust seam), added roundtrip-level replay and wrong-origin/source negatives, preserved the HARDEN-03 URL-hygiene sweep, and reconciled the T-03-NN header comments to canonical THREAT-06/THREAT-07.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-09 (worktree rebased onto dev HEAD first — see Issues)
- **Completed:** 2026-06-09
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Happy-path roundtrip now drives the REAL `runPopupFlow` (popup side) and `openAuthPopup` (opener side) via the `helpers.ts` DI fakes; the `{ code }` handle resolves THROUGH the real `isTrustedMessage` origin+source check (Pitfall 3 identity invariant honored — the `open()` return value `popupWin` is the same reference dispatched as the MessageEvent `source`).
- The real `api.bridge` handler is wrapped as a `ResponseLike` `fakeFetch` so `runPopupFlow` fetches it (the shipped `Response` structurally satisfies `{ ok, json() }`).
- Two roundtrip-level negatives folded in as sibling `it`s: replay (second `api.consume` of the same code -> 4xx + zero cookies, delete-on-read store) and wrong-origin/mismatched-source non-resolution (impostor dropped via sentinel-race, then a valid message still resolves).
- consume stays a direct, transport-agnostic `api.consume(makeRequest(...))` 302 call (D-09) — never routed through `runPopupFlow`/a fake fetch; no "navigation required / fetch is a violation" comment added.
- HARDEN-03 URL-hygiene sweep preserved and canonical (no session-token value in any client-constructed URL; the opaque `code` explicitly permitted in `?code=`).
- Three `T-03-NN` header-comment tags reconciled to canonical `THREAT-06`/`THREAT-07` (THREAT-10 noted for the roundtrip URL sweep); honesty-boundary wording retained; inline `THREAT-07` refs and the route-test `T-02-NN` tags left untouched.
- Full `packages/core` suite green at 98 tests (96 baseline + 2 new negatives). Zero new dependencies; no jsdom/happy-dom.

## Locked `it(...)` names (Plan 02 MUST cite these verbatim)

1. Happy-path (cited by THREAT-01, THREAT-07 roundtrip facet, THREAT-10):
   `"drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)"`
2. Replay negative (cited by THREAT-06 replay facet):
   `"replay: a second consume of the same code returns 4xx and sets no cookie"`
3. Wrong-origin/source negative (cited by THREAT-03):
   `"wrong-origin/mismatched-source message is dropped; openAuthPopup does not resolve, then a valid message still resolves"`

## Task Commits

1. **Task 1: Drive the happy-path roundtrip through the REAL runPopupFlow + openAuthPopup** - `8cb0768` (test)
2. **Task 2: Fold in replay + wrong-origin/source roundtrip negatives** - `8eb4e58` (test)
3. **Task 3: Reconcile T-03-NN header comments to canonical THREAT-NN + full-suite confirmation** - `74eb8f5` (refactor)

## Files Created/Modified

- `packages/core/src/__tests__/roundtrip.e2e.test.ts` - Hardened canonical roundtrip: happy-path now via the real `runPopupFlow`+`openAuthPopup` helpers through the real trust seam; added replay + wrong-origin/source negatives; preserved URL-hygiene sweep; reconciled THREAT-NN comments.

## Decisions Made

- Single-lined the consume call (`// prettier-ignore`) and shaped imports/dispatches so the `api.consume(makeRequest` acceptance grep matches AND the file stays prettier-clean. Pure formatting/readability decision; no behavior impact.
- Held the happy-path `it()` title verbatim (including "(simulated postMessage)") per the plan's stability requirement for Plan 02 citation, even though the body now drives the real helpers. The title is a citation key, not a behavioral claim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in the fresh worktree**
- **Found during:** Pre-Task-1 baseline run
- **Issue:** The worktree had no `node_modules`; `vitest` could not resolve (`ERR_MODULE_NOT_FOUND`), blocking all verification.
- **Fix:** `pnpm install --frozen-lockfile` (installs already-declared deps from the committed lockfile — NOT a new package add; the package-install prohibition targets adding NEW/unverified packages).
- **Files modified:** none tracked (node_modules is gitignored)
- **Verification:** `npx vitest run` then produced a clean 96-test baseline.
- **Committed in:** n/a (no tracked change)

**2. [Rule 3 - Blocking] Rebased the worktree branch onto dev HEAD**
- **Found during:** Initial context load
- **Issue:** The worktree branch `worktree-agent-aac3a9d601d4d1a49` was created from an early commit (`ba0c11f`) that predated all `.planning/` artifacts and the Phase 3 source — the known EnterWorktree wrong-base issue (#2015). The plan file and `packages/core` Phase 3 code were absent.
- **Fix:** Asserted HEAD was on the per-agent branch (a non-protected ref — safe to reset), then `git reset --hard dev` to pick up the correct base (`21e2338`).
- **Files modified:** none authored — fast-forwarded working tree to the intended base
- **Verification:** Plan file and `packages/core/src/__tests__/roundtrip.e2e.test.ts` present; baseline suite ran green.
- **Committed in:** n/a (branch pointer move only)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking environment setup). **Impact on plan:** Environment-only; no scope creep, no source behavior change beyond the planned test edits. Both were prerequisites to running the plan at all.

## Issues Encountered

- The worktree started from the wrong base commit (planning artifacts and Phase 3 source missing) and had no installed dependencies. Both were resolved as Rule 3 blockers (rebase onto `dev`, frozen-lockfile install) before Task 1. No further issues; all acceptance criteria and the full suite passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The three roundtrip `it(...)` names are LOCKED (listed verbatim above) and green. Plan 02 (`04-02`) can now cite them in `docs/threat-model.md` rows (THREAT-01/03/06/07/10) per D-04.
- Full `packages/core` suite is green at 98 tests; zero new dependencies; no DOM libs added.
- No blockers for Plan 02.

## Self-Check: PASSED

- `packages/core/src/__tests__/roundtrip.e2e.test.ts` exists on disk (modified).
- Commits `8cb0768`, `8eb4e58`, `74eb8f5` present in `git log`.
- `cd packages/core && pnpm test` → 98 passed (12 files). Focused file → 3 it()s pass.
- `grep -c "T-03-"` → 0; THREAT-06/07 present; THREAT-10 noted; honesty boundary retained.
- consume is `api.consume(makeRequest(...))` direct (no fetch-routed consume); no jsdom/happy-dom; no new dependency.

---
*Phase: 04-threat-model-roundtrip-hardening*
*Completed: 2026-06-09*
