---
phase: 02-bridge-consume-routes
verified: 2026-06-07T04:22:00Z
status: passed
score: 18/18 must-haves verified
overrides_applied: 0
re_verification:
  # initial verification — no prior VERIFICATION.md
deferred:
  - truth: "docs/threat-model.md enumerates all Mode A security properties with a mapped test"
    addressed_in: "Phase 4"
    evidence: "REQUIREMENTS.md traceability: HARDEN-01 → Phase 4 (Pending). Phase 2 delivers the negative-case TEST coverage for THREAT-04/05/06/08; the threat-model DOC is a Phase 4 deliverable, not a Phase 2 gate."
---

# Phase 2: Bridge & Consume Routes Verification Report

**Phase Goal:** The server-side handoff works — `/auth/bridge` mints opaque handles only for genuinely authenticated requests, and `/auth/consume` exchanges them for a correctly-attributed partitioned cookie — wired by a reusable config factory.
**Verified:** 2026-06-07T04:22:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is achieved in the codebase. The three security-critical halves are present, substantive, wired, and exercised by an asserting negative-test suite (61/61 green, `tsc --noEmit` clean under strict):

1. `/auth/bridge` runs `verifySession` FIRST and independently; a falsy result returns 401 with no handle minted — context signals (`?popup=true`) never gate the mint (THREAT-04).
2. `/auth/consume` exchanges a one-time handle via `store.consume` and re-sets each chunk as a CHIPS-partitioned cookie (Secure/HttpOnly/SameSite=None/Path=//Partitioned), 302-ing to a `sanitizeNext`-validated target; forged/replayed/absent/empty handles all collapse to a 4xx no-cookie path (THREAT-06/AM-1).
3. `createAuthBridge(options)` wires both handlers from one shared config and returns `{ bridge, consume }` (ROUTE-05/D-10), round-tripped end-to-end on the bench.

The CR-01 critical open-redirect bypass (backslash normalization) is FIXED in `auth-helpers.ts` (lines 45-50 reject `next[1] === "\\"` and any backslash) with dedicated negative tests for `/\evil.test`, `/\/evil.test`, and a mid-path backslash.

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | No-session request → 401, no handle minted, regardless of wrapper/context signal (ROUTE-01/THREAT-04) | ✓ VERIFIED | `bridge-route.ts:69-72` session gate runs before harvest/mint; tests at `bridge-route.test.ts:90` (401, getSetCookie []) and `:114` (?popup=true + null session → 401) |
| 2  | Success → 200 JSON `{ code }` only — no token, no JWT-shaped string, no handle in URL (ROUTE-02) | ✓ VERIFIED | `bridge-route.ts:102-105`; test `:141` code matches `/^[0-9a-f]{64}$/`, `:145` body has no `authjs.session-token`, JWT-shape negative assertion |
| 3  | Bridge sets ZERO cookies on success (AM-2 — PKCE non-interference) | ✓ VERIFIED | No `Set-Cookie` constructed in `bridge-route.ts`; test `:149` `getSetCookie()` toEqual([]) |
| 4  | Harvest selects only session-token base + numeric chunks; csrf/pkce/state/callback-url decoys excluded (D-05/ROUTE-04/THREAT-05) | ✓ VERIFIED | `cookie-codec.ts:61-76` integer-suffix-bounded match; test `:155` injects decoys, asserts payload excludes csrf/pkce |
| 5  | Verified session + no matching chunk → 5xx, store.create never called (D-15) | ✓ VERIFIED | `bridge-route.ts:90-92` (status 500 before mint); test `:197+` decoy-only Cookie → 5xx, create not reached |
| 6  | Present-but-disallowed Origin → 4xx; absent Origin proceeds (D-12/D-14) | ✓ VERIFIED | `bridge-route.ts:61-64` & `consume-route.ts:109-112`; tests assert both arms |
| 7  | Valid handle → 302 to sanitizeNext-validated target with one partitioned Set-Cookie per chunk, hardened floors, reconstructed from config (ROUTE-03/D-02) | ✓ VERIFIED | `consume-route.ts:131-151` + `cookie-codec.ts:92-107`; test `:120` 302, `:131` each cookie contains Partitioned/Secure/HttpOnly/SameSite=None/Path=/ |
| 8  | Forged or already-consumed handle → 4xx, no Set-Cookie (THREAT-06) | ✓ VERIFIED | `consume-route.ts:131-134` null→reject(400); tests `:144` (forged) and `:160` (replay, second 4xx, []) |
| 9  | Absent/empty code → same 4xx no-cookie path, store.consume never called with null/empty (AM-1) | ✓ VERIFIED | `consume-route.ts:122-124` guard textually BEFORE store call; test `:191`/`:212` assert [] |
| 10 | Set-Cookie omits Max-Age by default; configured maxAge adds Max-Age=<n> per chunk (D-17) | ✓ VERIFIED | `cookie-codec.ts:105` `opts.maxAge != null` guard; test `:238` default omits, maxAge:600 → every cookie carries it |
| 11 | createAuthBridge(options) returns `{ bridge, consume }` from one shared config (ROUTE-05/D-10) | ✓ VERIFIED | `create-auth-bridge.ts:38-46`; test `:295+` factory returns exactly bridge+consume, end-to-end round-trip `:333` |
| 12 | index.ts re-exports createAuthBridge, getAuthCookieName, sanitizeNext, AuthBridgeOptions, VerifySession | ✓ VERIFIED | `index.ts:22,26,31`; KV adapter correctly NOT re-exported (subpath only) |
| 13 | sanitizeNext rejects /auth, /api/auth, absolute, protocol-relative (//evil) AND backslash (/\evil) targets (ROUTE-06/THREAT-08, CR-01 fix) | ✓ VERIFIED | `auth-helpers.ts:45-63`; tests `:53,:58,:65,:73` including backslash bypass cases |
| 14 | getAuthCookieName resolves __Secure- default, non-prefixed under secure:false, explicit override wins (D-16) | ✓ VERIFIED | `auth-helpers.ts:78-86`; resolution tests present |
| 15 | TransferPayload is Array<{name,value}>; zero authCookieValue refs in src (D-01) | ✓ VERIFIED | `transfer-store/types.ts:25`; `grep authCookieValue src/` returns 0 matches |
| 16 | No Auth.js vendor type imported in route/type files (D-04, version-agnostic) | ✓ VERIFIED | grep for `from "next-auth"`/`@auth` returns only comment-header matches, no imports |
| 17 | Set-Cookie emitted one-per-chunk via Headers.append, never comma-joined (Pattern 2) | ✓ VERIFIED | `consume-route.ts:83-87` writeChunkCookies appends per chunk |
| 18 | Full suite + tsc green | ✓ VERIFIED | `pnpm test` → 6 files, 61/61 passing; `tsc --noEmit` exit 0 |

**Score:** 18/18 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `docs/threat-model.md` enumerating Mode A properties with mapped tests | Phase 4 | REQUIREMENTS.md traceability maps HARDEN-01 → Phase 4 (Pending). Phase 2 delivers the THREAT-04/05/06/08 negative TEST coverage; the doc is a Phase 4 deliverable. Not a Phase 2 gap. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/core/src/auth-helpers.ts` | sanitizeNext + getAuthCookieName | ✓ VERIFIED | Both bare exports; CR-01 backslash fix present (45-50) |
| `packages/core/src/cookie-codec.ts` | parseCookieHeader + serializeSetCookie + harvestSessionChunks | ✓ VERIFIED | All three exported; hardened CHIPS floors; harvest lives here (per 02-01-SUMMARY) |
| `packages/core/src/types.ts` | AuthBridgeOptions + VerifySession | ✓ VERIFIED | Structural, no vendor type; required/optional split per D-11/D-16/D-17 |
| `packages/core/src/bridge-route.ts` | createBridgeHandler | ✓ VERIFIED | 107 lines; gate ordering session→harvest→guard→mint→200 |
| `packages/core/src/consume-route.ts` | createConsumeHandler + factored cookie-writer | ✓ VERIFIED | 153 lines; AM-1 guard before store; factored writeChunkCookies (D-13) |
| `packages/core/src/create-auth-bridge.ts` | createAuthBridge → { bridge, consume } | ✓ VERIFIED | Single shared-options wiring (D-10) |
| `packages/core/src/index.ts` | extended public surface | ✓ VERIFIED | All new symbols re-exported; KV kept out |
| `packages/core/src/__tests__/{auth-helpers,bridge-route,consume-route}.test.ts` | negative suites | ✓ VERIFIED | All present, asserting; 61/61 green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| bridge-route.ts | options.verifySession | awaited gate before harvest/store.create | ✓ WIRED | `:69` await before `:96` store.create |
| bridge-route.ts | store.create | only after verified session + non-empty harvest | ✓ WIRED | `:96`, guarded by `:70` and `:90` |
| bridge-route.ts | harvestSessionChunks / getAuthCookieName | resolve prefix then match base + .N | ✓ WIRED | `:76`, `:85` |
| consume-route.ts | store.consume | null-on-miss → 4xx; absent/empty guard first | ✓ WIRED | `:122` guard before `:131` consume |
| consume-route.ts | serializeSetCookie / Headers.append | one Set-Cookie per chunk | ✓ WIRED | `:83-87` |
| create-auth-bridge.ts | createBridgeHandler + createConsumeHandler | single factory, shared options | ✓ WIRED | `:43-44` |
| index.ts | create-auth-bridge.ts + auth-helpers.ts | barrel re-exports | ✓ WIRED | `:22,26,31` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite passes | `pnpm test` | 6 files, 61/61 passing | ✓ PASS |
| Typechecks under strict | `pnpm exec tsc --noEmit` | exit 0, no output | ✓ PASS |
| No authCookieValue in src | `grep -rn authCookieValue src/` | 0 matches (exit 1) | ✓ PASS |
| CR-01 fix rejects backslash | source `auth-helpers.ts:47-49` + tests `:65-74` | backslash → "/" asserted | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ROUTE-01 | 02-02 | /auth/bridge verifies real session before minting (THREAT-04) | ✓ SATISFIED | Truth 1 |
| ROUTE-02 | 02-02 | Returns only opaque handle, no token in response/URL | ✓ SATISFIED | Truth 2 |
| ROUTE-03 | 02-03 | /auth/consume exchanges handle, sets partitioned cookie (THREAT-06) | ✓ SATISFIED | Truths 7, 8 |
| ROUTE-04 | 02-02 | PKCE preserved (bridge does not clobber Auth.js cookies) | ✓ SATISFIED | Truths 3, 4 (zero cookies + decoy exclusion) |
| ROUTE-05 | 02-03 | Config factory wires routes with app options | ✓ SATISFIED | Truth 11 |
| ROUTE-06 | 02-01 | sanitizeNext rejects /auth, /api/auth targets (THREAT-08) | ✓ SATISFIED | Truth 13 (incl. CR-01 backslash fix) |

All 6 declared requirement IDs accounted for. No orphaned requirements — REQUIREMENTS.md maps exactly ROUTE-01..06 to Phase 2, all marked Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER in any modified src file | — | Clean |

The 4 WARNING + 2 INFO findings from 02-REVIEW.md (WR-01 CRLF sanitization, WR-02 maxAge validation, WR-03 Origin normalization, WR-04 duplicated Origin check, IN-01 empty-base guard, IN-02 comment density) are robustness/maintainability defense-in-depth items, not goal-blocking. They are explicitly deferred to a follow-up task per phase context. None breaks an observable phase-goal truth: WR-01/WR-02 inputs are config/own-session-derived (not attacker-injected today), WR-03/WR-04 fail closed. Noted as informational; recommend tracking the follow-up before v0.1 publish.

### Human Verification Required

None. This phase produces pure server-side handler logic with no visual/real-time/external-service surface. All invariants are deterministically asserted on the Vitest bench (Web-standard Request/Response, no Next.js runtime coupling — D-06). No `<verify><human-check>` blocks were declared in the PLANs.

### Gaps Summary

No gaps. The server-side handoff is present, substantive, and wired: the session gate refuses unauthenticated mints; the consume handler exchanges one-time handles for correctly-attributed CHIPS-partitioned cookies; the factory wires both from one config; the CR-01 open-redirect critical is fixed with negative tests. The only not-yet-present item (`docs/threat-model.md`) is correctly deferred to Phase 4 per the REQUIREMENTS.md traceability — its TEST coverage is delivered in this phase. The outstanding REVIEW warnings are defense-in-depth hardening, not phase-goal blockers.

---

_Verified: 2026-06-07T04:22:00Z_
_Verifier: Claude (gsd-verifier)_
