---
phase: 04-threat-model-roundtrip-hardening
plan: 02
subsystem: testing
tags: [threat-model, docs, security, popup-bridge, chips, postMessage, traceability, HARDEN-01]

# Dependency graph
requires:
  - phase: 04-threat-model-roundtrip-hardening
    provides: "Plan 01's three LOCKED hardened-roundtrip it() names (happy-path, replay, wrong-origin/source) cited by THREAT-01/03/06/07/10"
provides:
  - "docs/threat-model.md — the canonical, self-contained Mode A invariant registry: THREAT-01..THREAT-10 each mapping property -> mitigation (file:line) -> a currently-GREEN test::name"
  - "THREAT-02 split into entropy / one-time-use / TTL sub-rows; THREAT-01 + THREAT-10 dual-cite one locked roundtrip it()"
  - "Explicit D-11 honesty boundary on the partitioned-cookie row (emission + data flow proven, NOT real CHIPS enforcement) + the deferred fetch-vs-navigation transport question (Phase 5)"
  - "CLAUDE.md session-start pointer redirected from docs/architecture.md to docs/threat-model.md (D-08), discipline rule intact"
affects: [phase-5-real-browser-chips-verification, auth-js-docs-recipe, external-audit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Living traceability artifact: every security-invariant row cites an exact file::it-name verified against the live green suite (a dead citation is a HARDEN-01/D-04 defect)"
    - "Self-contained registry (not a phase audit): 02-SECURITY.md row shape reused, phase-audit framing (frontmatter/CLOSED-OPEN column/Accepted-Risks log) dropped"

key-files:
  created:
    - docs/threat-model.md
  modified:
    - CLAUDE.md

key-decisions:
  - "Cited tests as `filename.test.ts :: \"name\"` (filename, not full path) so the doc reads cleanly AND the plan's automated verify loop (which extracts on the .test.ts filename prefix) matches"
  - "Backslash in the THREAT-08 backslash-redirect citation written as a single literal backslash (/\\evil at runtime) to exactly match the evaluated vitest it() name, not the TS-source escaped form"
  - "Typographic arrows (→, ↔) in cited test names and prose are retained verbatim — they are part of the real green test strings (e.g. `→ /`), not emoji"

patterns-established:
  - "Pattern 1: THREAT-NN registry table — property -> mitigation(file:line) -> green test::name, one canonical namespace, single source of truth"
  - "Pattern 2: Honesty-boundary note — separate prose section stating exactly what the bench proves (emission/data-flow) vs what it does NOT (CHIPS partition enforcement), with the open transport question deferred not settled"

requirements-completed: [HARDEN-01]

# Metrics
duration: ~5 min
completed: 2026-06-09
---

# Phase 4 Plan 02: Threat-Model Invariant Registry Summary

**Authored the canonical `docs/threat-model.md` — a THREAT-01..THREAT-10 keyed Mode A invariant registry where every row maps property -> mitigation (file:line) -> a currently-green `test::name`, with THREAT-02 split into entropy/one-time-use/TTL facets, THREAT-01 and THREAT-10 dual-citing the locked hardened roundtrip, and an explicit D-11 honesty boundary on the partitioned cookie — and redirected CLAUDE.md's single session-start pointer to it.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-09 (worktree rebased onto dev HEAD `1c481d1` first — see Deviations)
- **Completed:** 2026-06-09
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- Created `docs/threat-model.md` (and the `docs/` directory): a self-contained registry with a prose intro (Mode A scope, the one architectural shape, THREAT-NN as canonical namespace + single source of truth, Mode B out-of-scope note), a trust-boundary table, the THREAT-NN invariant table, and a dedicated D-11 honesty-boundary section.
- Every canonical invariant present: THREAT-01 through THREAT-10, with THREAT-02 as three sub-rows (entropy / one-time-use / TTL) per RESEARCH Open Question 2.
- All 25 unique cited `test-file :: it-name` strings verified against the live green `packages/core` suite — zero MISSING (D-04 satisfied).
- THREAT-01 and THREAT-10 dual-cite the SAME locked hardened-roundtrip happy-path it() from Plan 01 (`"drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)"`).
- THREAT-03 cites the unit predicates + in-flow tests AND the new roundtrip wrong-origin/source negative; THREAT-06 cites the consume-route negatives AND the new roundtrip replay negative.
- THREAT-06 row + a dedicated honesty-boundary section state the D-11 boundary explicitly: emission + data flow proven, real CHIPS partition enforcement is a manual/browser check; the fetch-vs-navigation transport is stated as an UNRESOLVED empirical question deferred to Phase 5 (D-09 addendum) — NOT a settled "consume must be navigation" requirement.
- `docs/architecture.md` was NOT created (D-07). No emoji in the doc body; no SPDX/license header.
- Redirected CLAUDE.md's single `docs/architecture.md` session-start pointer (line 125) to `docs/threat-model.md`; the "Threat model discipline" rule was left intact and unweakened (D-08). After the edit `docs/architecture` appears NOWHERE in CLAUDE.md and `docs/threat-model.md` appears twice.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author docs/threat-model.md — THREAT-NN invariant registry citing only green tests (HARDEN-01)** — `62d9bd7` (docs)
2. **Task 2: Redirect CLAUDE.md's docs/architecture.md pointer to docs/threat-model.md (D-08)** — `ebeb578` (docs)

_Plan metadata commit follows this SUMMARY._

## Files Created/Modified

- `docs/threat-model.md` (created) — canonical Mode A invariant registry: prose intro, trust-boundary table, THREAT-01..THREAT-10 table (each row property -> mitigation(file:line) -> green test::name), THREAT-01/THREAT-10 dual-cite caveat, D-11 honesty-boundary section.
- `CLAUDE.md` (modified) — line 125 session-start pointer redirected from `docs/architecture.md` to `docs/threat-model.md`; discipline section untouched.

## Decisions Made

- Cited tests as `filename.test.ts :: "name"` (bare filename) rather than full repo path: keeps rows readable and makes the plan's automated verify loop (which extracts on the `.test.ts` filename prefix) match cleanly.
- Wrote the THREAT-08 backslash-redirect citation with a single literal backslash (`/\evil`) to match the evaluated vitest `it()` runtime name exactly, not the doubled TS-source escaped form — verified byte-for-byte against `auth-helpers.test.ts`.
- Retained typographic arrows (`→`, `↔`) verbatim — they are part of the real green test strings and prose, not emoji.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebased the worktree branch onto dev HEAD + installed dependencies**
- **Found during:** Pre-Task-1 setup
- **Issue:** The worktree branch was created from `ba0c11f` (the known EnterWorktree wrong-base issue #2015) — predating all `.planning/` Phase 4 artifacts, Plan 01's hardened roundtrip, and `packages/core` source; `node_modules` was also absent, blocking all verification.
- **Fix:** Asserted HEAD was on the non-protected per-agent branch, then `git reset --hard dev` (to `1c481d1`), then `pnpm install --frozen-lockfile` (installs already-declared deps from the committed lockfile — NOT a new package add).
- **Files modified:** none tracked (branch pointer move + gitignored node_modules)
- **Verification:** Plan file, `04-01-SUMMARY.md`, and `roundtrip.e2e.test.ts` present; baseline suite ran green at 98 tests.
- **Committed in:** n/a (no tracked change)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking environment setup). **Impact on plan:** Environment-only; no scope creep, no content change beyond the planned doc + pointer edit. It was a prerequisite to running the plan at all.

## Issues Encountered

- During authoring, the THREAT-08 backslash citation initially lost its backslash (`/evil` instead of `/\evil`) — caught by a byte-level comparison against the source `it()` name and corrected to a single literal backslash before committing. No other issues; all acceptance criteria and the full suite passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `docs/threat-model.md` is the living traceability artifact binding the Mode A security story to the green suite — ready for an external auditor or the Auth.js docs-recipe reader.
- The D-11 honesty boundary and the deferred fetch-vs-navigation transport question are documented explicitly, flagging the exact real-browser CHIPS verification owed to Phase 5.
- HARDEN-01 complete. Phase 4 (Plans 01 + 02) is done; no blockers.

## Self-Check: PASSED

- `docs/threat-model.md` exists on disk; `docs/architecture.md` does NOT exist (D-07).
- Commits `62d9bd7` (threat-model.md) and `ebeb578` (CLAUDE.md) present in `git log`.
- All 25 unique cited `test::name` strings resolve against the green source (verified loop: 0 MISSING); `cd packages/core && pnpm test` → 98 passed (12 files).
- THREAT-01..THREAT-10 all present; THREAT-02 in three facets; THREAT-01 + THREAT-10 dual-cite the same locked roundtrip it(); THREAT-06 states the D-11 honesty boundary (emission, NOT enforcement).
- CLAUDE.md: `docs/architecture` count = 0; `docs/threat-model.md` count = 2; discipline rule intact verbatim.

---
*Phase: 04-threat-model-roundtrip-hardening*
*Completed: 2026-06-09*
