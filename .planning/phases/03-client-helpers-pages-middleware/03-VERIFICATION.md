---
phase: 03-client-helpers-pages-middleware
verified: 2026-06-08T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
---

# Phase 3: Client Helpers, Pages & Middleware — Verification Report

**Phase Goal:** The client surfaces that drive the flow exist and connect to the routes, producing the first complete iframe → partitioned-cookie flow on the Vitest test bench.
**Verified:** 2026-06-08
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Popup flow completes and signals opener via postMessage; `openAuthPopup` opens the popup and enforces origin checks; wrong-origin rejected (THREAT-03) | ✓ VERIFIED | `runPopupFlow` (popup-flow.ts:104-134) posts `{source,type,code}` to opener; `openAuthPopup` (open-auth-popup.ts:212-316) delegates origin+source check to `isTrustedMessage`. Tests `open-auth-popup.test.ts:84` (wrong-origin ignored), `:101` (wrong-source racer ignored) assert THREAT-03. Per D-13, the `/auth/popup` `.tsx` page is intentionally deferred to Phase 5; the framework-agnostic `runPopupFlow` equivalent exists and is tested — deviation documented in ROADMAP.md:96 and 03-04-SUMMARY.md. |
| 2 | `detectContext` returns open-union `'iframe'\|'browser'\|'pwa-shell'`; callsites use default-fallback, not exhaustive switch | ✓ VERIFIED | detect-context.ts:22 exports the wide union (incl. `pwa-shell` never returned in v0.1); `routeForContext` (:69-72) uses if/else default-fallback; grep confirms no `switch` (only prose comments). `detect-context.test.ts` covers iframe/browser/cross-origin-throw + unknown→default. |
| 3 | Middleware routes by detected context for UX only; never gates security on detection | ✓ VERIFIED | `createBridgeMiddleware` (middleware.ts:77-101) reads `Sec-Fetch-Dest`, rewrites unauth iframe → popup entry, passes through everything else; only auth input is app-supplied `isAuthenticated`. `middleware.test.ts:98` forged-signal invariance test (auth state fixed, signal varied across iframe/null/forged → access invariant); `:155` structural test asserts no `verifySession`/store/`node:crypto`/`./index` import. |
| 4 | No session token in any URL the client constructs across the popup flow (THREAT-07) | ✓ VERIFIED | `popup-flow.test.ts:88-89` asserts `targetOrigin` is explicit host origin, `not.toBe("*")`. E2E `roundtrip.e2e.test.ts:150-169` sweeps every client-constructed URL (bridge + consume) and asserts no token value appears; explicitly permits the opaque `code` in consume URL (D-15) and asserts it IS present. Token rides only in `Set-Cookie`. |
| 5 | First end-to-end iframe → consumed handle → partitioned cookie runs green on Vitest bench | ✓ VERIFIED | `roundtrip.e2e.test.ts` drives the REAL Phase 2 bridge + consume handlers (via `createAuthBridge`) with plain `Request` objects: bridge mints 200 `{code}` (64-hex), function-level postMessage sim routes through real `isTrustedMessage`, opener drives consume → 302 + per-chunk `Partitioned` Set-Cookie round-tripping the chunks. Full suite: 96/96 tests pass. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/is-trusted-message.ts` | THREAT-03 origin+source predicate | ✓ VERIFIED | Pure, zero-DOM; both checks required (lines 55-56). Exported + re-exported from index. |
| `src/detect-context.ts` | open-union detector + `BridgeContext` | ✓ VERIFIED | Wide union, try/catch cross-origin, default-fallback router. Exported + re-exported. |
| `src/popup-flow.ts` | `runPopupFlow` popup-side orchestrator | ✓ VERIFIED | Fetches bridge, posts namespaced message with explicit targetOrigin, structured auth-error path. Re-exported. |
| `src/open-auth-popup.ts` | `openAuthPopup` opener-side promise | ✓ VERIFIED | Imports + delegates to `isTrustedMessage`; typed `OpenAuthPopupError` rejections (auth-error/popup-closed/timeout/popup-blocked); idempotent cleanup. Re-exported. |
| `src/middleware.ts` | store-free/crypto-free UX router | ✓ VERIFIED | Edge-safe (structural grep + test confirm no forbidden imports); rewrite-not-redirect. Re-exported. |
| `src/index.ts` | public surface re-exports | ✓ VERIFIED | All 5 functions + `BridgeContext` type re-exported; node require confirms all 5 resolvable in dist; `./store/kv` subpath intact. |
| `src/__tests__/roundtrip.e2e.test.ts` | headline E2E + THREAT-07 | ✓ VERIFIED | Drives real handlers; substantive assertions, not hollow. |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `open-auth-popup.ts` | `is-trusted-message.ts` | `import { isTrustedMessage }` + delegation in listener | ✓ WIRED (open-auth-popup.ts:24, :262) |
| `popup-flow.ts` | opener (cross-window) | `postMessage(message, hostOrigin)` never `'*'` | ✓ WIRED (popup-flow.ts:133) |
| `middleware.ts` | `Sec-Fetch-Dest` header | `request.headers.get('Sec-Fetch-Dest')` | ✓ WIRED (middleware.ts:90) |
| `roundtrip.e2e.test.ts` | real bridge/consume handlers | `createAuthBridge` + in-memory store | ✓ WIRED (drives `api.bridge`/`api.consume`) |
| `roundtrip.e2e.test.ts` | Partitioned Set-Cookie | `getSetCookie()` assertion | ✓ WIRED (test:135, :147) |
| `index.ts` | 4 Phase 3 modules | additive bare re-exports | ✓ WIRED (index.ts:44-63) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `pnpm test` | 12 files, 96 tests passed | ✓ PASS |
| Typecheck clean | `pnpm exec tsc --noEmit` | exit 0 | ✓ PASS |
| Build re-emits dist | `pnpm build` | Build success, dist/index.js 10.81KB | ✓ PASS |
| 5 exports resolvable | `require('./dist/index.js')` | all 5 functions present | ✓ PASS |
| KV subpath intact | `require('./dist/store/kv.js')` | `createKVTransferStore` present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLIENT-01 | 03-02 | Popup flow completes + signals opener via postMessage | ✓ SATISFIED | `runPopupFlow` (D-13: framework-agnostic equivalent of the deferred `.tsx` page) + tests |
| CLIENT-02 | 03-01, 03-03 | `openAuthPopup` enforces postMessage origin checks (THREAT-03) | ✓ SATISFIED | `isTrustedMessage` + `openAuthPopup` delegation; wrong-origin/wrong-source tests |
| CLIENT-03 | 03-01 | `detectContext` open-union, default-fallback | ✓ SATISFIED | Wide union, no exhaustive switch, forward-compat test |
| CLIENT-04 | 03-02 | Middleware UX routing only, not a security gate | ✓ SATISFIED | Forged-signal invariance + structural Edge-safety tests |
| CLIENT-05 | 03-04 | Client URL hygiene — no session token in any URL (THREAT-07) | ✓ SATISFIED | E2E URL sweep + popup-flow no-wildcard assertions |

All 5 phase requirement IDs accounted for. No orphaned requirements (REQUIREMENTS.md maps exactly CLIENT-01..05 to Phase 3).

### Anti-Patterns Found

None. No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in any phase source file. `return null` matches in open-auth-popup.ts are legitimate narrowing guards in `asBridgeMessage` (rejecting non-namespaced messages) and no-op cleanup initializers — not stubs. Shipped source carries no internal requirement IDs (D-07 amend honored); no React/`.tsx`/JSX (D-13 honored — only prose comment references).

### Notes on Scope Boundaries (correctly out of scope)

- `docs/threat-model.md` is HARDEN-01, a Phase 4 deliverable — its absence is correct for Phase 3. THREAT-03/THREAT-07 are verified at the code/test level here, as the success criteria require.
- Real CHIPS partition enforcement is a Phase 4 browser check; the E2E asserts `Partitioned` attribute EMISSION only, with the honesty boundary documented in the test (roundtrip.e2e.test.ts:143-148).

### Human Verification Required

None. All five success criteria are verifiable programmatically on the pure-Node Vitest bench (the phase goal is explicitly bench-scoped). Real-browser CHIPS partition enforcement is deferred to Phase 4 by design and is not a Phase 3 criterion.

### Gaps Summary

No gaps. Every ROADMAP success criterion is observably true in the codebase. The D-13 deviation (framework-agnostic `runPopupFlow` instead of a `/auth/popup` `.tsx` page) is intentional, documented in ROADMAP.md and 03-04-SUMMARY.md, and the framework-agnostic equivalent exists and is tested — so Success Criterion 1 is satisfied, not failed. Security-critical invariants hold in real source: THREAT-03 (origin AND source identity, both required, with wrong-origin and wrong-source negative tests), explicit non-wildcard targetOrigin, THREAT-07 (no token in any client-constructed URL with the correct token-vs-handle distinction), and middleware proven UX-only both behaviorally (forged-signal invariance) and structurally (no store/crypto/verifySession import). The first end-to-end iframe → bridge → consume → Partitioned-cookie flow runs green against the real Phase 2 handlers. Full suite 96/96, typecheck clean, build re-emits all exports with the KV subpath intact.

---

_Verified: 2026-06-08_
_Verifier: Claude (gsd-verifier)_
