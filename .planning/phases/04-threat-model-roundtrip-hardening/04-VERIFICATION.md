---
phase: 04-threat-model-roundtrip-hardening
verified: 2026-06-09T00:00:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
---

# Phase 04: Threat Model & Roundtrip Hardening Verification Report

**Phase Goal:** The complete Mode A security story is written down and proven end-to-end — every invariant has a documented entry and a passing integration test, with the no-token-in-URL property closed at roundtrip level.
**Verified:** 2026-06-09
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + Requirements)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 / HARDEN-01: `docs/threat-model.md` enumerates every Mode A security property, each invariant mapped to a specific green test | ✓ VERIFIED | `docs/threat-model.md` present; THREAT-01..THREAT-10 all grep-present; THREAT-02 split into 3 facets (entropy/one-time-use/TTL); 27/27 cited `*.test.ts :: "<name>"` resolve in `packages/core/src` with 0 MISSING |
| 2 | SC2 / HARDEN-02: single-origin integration test simulates full iframe→popup→bridge→consume→partitioned-cookie roundtrip and passes (THREAT-01) | ✓ VERIFIED | `roundtrip.e2e.test.ts` happy-path (line 72) drives REAL `runPopupFlow` (line 130) + `openAuthPopup` (line 118) through the real `isTrustedMessage` seam; asserts 302 + per-chunk `Partitioned` Set-Cookie; suite green (98 tests) |
| 3 | SC3 / HARDEN-03: integration assertion confirms no session token in any URL across the full flow, closing THREAT-09/THREAT-10 at roundtrip level | ✓ VERIFIED | URL-hygiene sweep preserved (`roundtrip.e2e.test.ts:184-203`); token values forbidden in every client-constructed URL; opaque `code` explicitly permitted+asserted present (`code=${handle}`, line 196) |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/__tests__/roundtrip.e2e.test.ts` | Hardened roundtrip: happy-path via real helpers + replay + wrong-origin/source negatives + URL sweep + reconciled THREAT-NN | ✓ VERIFIED | THREE `it`s in describe (lines 72, 210, 252); imports `openAuthPopup, runPopupFlow` (line 40); 0 `T-03-` tags; no jsdom/happy-dom |
| `docs/threat-model.md` | THREAT-NN invariant registry, every row cites a green test | ✓ VERIFIED | THREAT-01..10 present; 27/27 citations green; THREAT-06 honesty boundary stated; THREAT-01/THREAT-10 dual-cite same roundtrip name; no emoji, no SPDX header |
| `CLAUDE.md` | Redirected pointer to threat-model.md, discipline rule intact | ✓ VERIFIED | Line 125 points at `docs/threat-model.md`; `docs/architecture` count 0; `docs/threat-model.md` count 2; discipline rule verbatim at line 71 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `roundtrip.e2e.test.ts` | `runPopupFlow` + `openAuthPopup` | DI fakes from helpers.ts | ✓ WIRED | `runPopupFlow({ fetch: fakeFetch, ... })` line 130; `openAuthPopup({...})` lines 118, 278; handle crosses real `isTrustedMessage` seam via `bus.dispatch({ origin, source: popupWin, ... })` |
| `roundtrip.e2e.test.ts` | `api.consume` (real handler) | direct `api.consume(makeRequest(...))` | ✓ WIRED | 4 direct `api.consume(makeRequest` calls; ZERO fetch-routed consume (grep `fetch(.*consume` → NONE); transport-agnostic bench preserved (D-09) |
| `docs/threat-model.md` | `packages/core/src/**/*.test.ts` | every row cites green test::name | ✓ WIRED | 27/27 cited names resolve; spot-checked code-evidence line numbers accurate (`bridge-route.ts:102-105`, `consume-route.ts:131-134`, `is-trusted-message.ts:55-57`, generate-code line 19 = `randomBytes(32).toString("hex")`) |
| `CLAUDE.md` | `docs/threat-model.md` | session-start pointer redirected | ✓ WIRED | Line 125 redirected; no `docs/architecture` remains |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green | `cd packages/core && pnpm test` | Test Files 12 passed (12); Tests 98 passed (98) | ✓ PASS |
| Three `it`s in roundtrip describe | `grep -c "  it(" roundtrip.e2e.test.ts` | 3 | ✓ PASS |
| All doc citations resolve | citation-resolve loop over `docs/threat-model.md` | TOTAL CITED: 27, MISSING: 0 | ✓ PASS |
| D-06: no T-03-NN tags | `grep -c "T-03-" roundtrip.e2e.test.ts` | 0 | ✓ PASS |
| D-07: architecture.md absent | `test -f docs/architecture.md` | ABSENT | ✓ PASS |
| D-08: CLAUDE.md pointer | `grep -c docs/architecture / docs/threat-model.md` | 0 / 2 | ✓ PASS |
| Zero new deps | `git diff <phase-start>..HEAD packages/core/package.json` | empty | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HARDEN-01 | 04-02 | threat-model.md enumerates all Mode A properties with a mapped test per invariant | ✓ SATISFIED | THREAT-01..10 + THREAT-02 3-facet split; 27/27 green citations; honesty boundary present |
| HARDEN-02 | 04-01 | E2E test simulates iframe→popup→bridge→consume→partitioned-cookie roundtrip (THREAT-01) | ✓ SATISFIED | Happy-path drives real runPopupFlow+openAuthPopup; replay + wrong-origin/source negatives green |
| HARDEN-03 | 04-01 | Integration test confirms no session token in any URL (closes THREAT-09/10 at roundtrip) | ✓ SATISFIED | URL-hygiene sweep over all client-constructed URLs; token forbidden, opaque code permitted+asserted |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TODO/FIXME/XXX/TBD debt markers in modified files; no stub returns; no fetch-routed consume; no jsdom import | — | None |

### Honesty-Boundary & Negation Checks

- THREAT-06 row + dedicated honesty section (`docs/threat-model.md:61-78`) state the D-11 boundary: `Partitioned` attribute EMISSION + data flow ONLY, NOT real CHIPS enforcement.
- The doc explicitly NEGATES "consume must be a navigation / fetch is a violation" (line 77: "This document does NOT assert..."). The lone grep hit is the negation, not an assertion — verified correct.
- The test file carries NO "navigation required"/"fetch is a violation" comment (grep → NONE).

### Human Verification Required

None. All success criteria are programmatically verifiable: file existence, citation resolution against the live suite, grep-level wiring, and a green 98-test run. The CHIPS partition-enforcement and fetch-vs-navigation questions are explicitly deferred to Phase 5 (documented as an open boundary in the threat model), not gaps in this phase.

### Gaps Summary

No gaps. All three requirements (HARDEN-01/02/03) are satisfied with concrete codebase evidence. The hardened roundtrip drives the real client helpers across the real trust seam, the doc's 27 citations all resolve to green tests, the URL-hygiene property is closed at roundtrip level, and all decision constraints (D-06 T-03-NN reconciliation, D-07 no architecture.md, D-08 CLAUDE.md pointer redirect + discipline rule intact, D-09 transport-agnostic consume, D-11 honesty boundary) hold. Zero new dependencies.

**Minor note (informational, not a gap):** the doc's code-evidence column shortens `transfer-store/generate-code.ts:19` to `generate-code.ts:19`. The preamble states code paths are relative to `packages/core/src/`, so the strictly-correct path would include the `transfer-store/` subdir. The cited line content matches exactly and the test citation resolves, so this does not affect any invariant — it is a cosmetic path-shortening, not a dead or wrong citation.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
