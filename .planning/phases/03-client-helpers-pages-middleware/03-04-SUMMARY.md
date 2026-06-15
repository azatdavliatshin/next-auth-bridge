---
phase: 03-client-helpers-pages-middleware
plan: 04
subsystem: auth
tags: [public-surface, re-exports, e2e, roundtrip, THREAT-07, partitioned-cookie, vitest]

# Dependency graph
requires:
  - phase: 03-client-helpers-pages-middleware
    plan: 01
    provides: isTrustedMessage (origin+source trust predicate) + detectContext / BridgeContext type
  - phase: 03-client-helpers-pages-middleware
    plan: 02
    provides: createBridgeMiddleware (wrapper/iframe detection + redirect routing)
  - phase: 03-client-helpers-pages-middleware
    plan: 03
    provides: openAuthPopup (opener-side handoff) + runPopupFlow (popup-side flow)
  - phase: 02
    plan: "*"
    provides: createBridgeHandler / createConsumeHandler / createAuthBridge (the real Phase 2 handlers) + the in-memory store + cookie-codec
provides:
  - "Extended public surface (index.ts) — detectContext, isTrustedMessage, runPopupFlow, openAuthPopup, createBridgeMiddleware re-exported as bare symbols + the BridgeContext type"
  - "roundtrip.e2e.test.ts — the first complete iframe->bridge->(postMessage sim)->consume->Partitioned-cookie flow proven on the pure-Node bench (success criterion 5 / D-11)"
  - "THREAT-07 / CLIENT-05 closure — the session token is proven absent from every client-constructed URL while the opaque handle is permitted in the consume URL (D-15)"
affects: [phase-04-browser-verification, phase-05-example-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Function-level postMessage simulation: shape the bridge's { code } JSON into the exact popup->opener message, route it through the REAL isTrustedMessage predicate, then extract the handle — no DOM, no cross-window channel on the pure-Node bench (D-11)"
    - "End-to-end seam test drives the REAL Phase 2 handlers (not stubs) via createAuthBridge + plain Request objects + one shared in-memory store"
    - "URL-hygiene sweep: collect every client-constructed URL across the flow and assert no session-token value appears in any, while asserting the opaque code IS present in the consume URL (token-vs-handle distinction, D-15)"
    - "Additive bare re-exports in the getAuthCookieName/sanitizeNext discipline — symbols stay separately importable, never bundled into a factory return"

key-files:
  created:
    - packages/core/src/__tests__/roundtrip.e2e.test.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "createBridgeMiddleware stays in the MAIN entry as a separate symbol, not a ./middleware subpath — its Edge-safety comes from its own store-free import graph, not a subpath boundary (D-16)"
  - "No ./react or .tsx subpath added to the public surface — the package carries no DOM/React entry (D-13)"
  - "The KV adapter remains behind ./store/kv only and is NOT re-exported from the main entry (D-11); verified the subpath still resolves after the rebuild"
  - "The simulated postMessage is routed through the real isTrustedMessage predicate (not bypassed) so the trust seam is exercised inside the end-to-end flow, not just in its own unit suite"
  - "Honesty boundary documented in the test: the E2E asserts Partitioned attribute EMISSION + the full data flow only — real CHIPS partition enforcement is deferred to a Phase 4 browser check (D-11 amend)"

requirements-completed: [CLIENT-05]

# Metrics
duration: ~6min
completed: 2026-06-08
---

# Phase 3 Plan 04: Public Surface Wiring + Headline E2E Roundtrip Summary

**Wires the Phase 3 client surface into `index.ts` (detectContext, isTrustedMessage, runPopupFlow, openAuthPopup, createBridgeMiddleware + the BridgeContext type as bare re-exports) and proves the first complete iframe->bridge->(function-level postMessage sim)->consume->Partitioned-cookie flow GREEN on the existing pure-Node Vitest bench — driving the REAL Phase 2 handlers and closing THREAT-07 client-side URL hygiene with the correct token-vs-handle distinction (CLIENT-05 / D-15).**

## Performance

- Wave: 3 (final wave of Phase 3) — depended on every source symbol from Waves 1-2, all merged on the base.
- 2 tasks, 2 atomic commits, no deviations.
- Full suite after this plan: 12 test files / 96 tests, all green.

## What was built

### Task 1 — extend the public surface (`index.ts`) — commit `653c483`

Added an additive "Phase 3 client surface" export block mirroring the existing grouped/commented style:

- `export { detectContext }` from `./detect-context.js`
- `export { isTrustedMessage }` from `./is-trusted-message.js`
- `export { runPopupFlow }` from `./popup-flow.js`
- `export { openAuthPopup }` from `./open-auth-popup.js`
- `export { createBridgeMiddleware }` from `./middleware.js`
- `export type { BridgeContext }` from `./detect-context.js`

`pnpm build` re-emits `dist/index.{js,d.ts}` cleanly. Verified (ESM import — the package is ESM-only, so `require` is not applicable):

- all five functions resolve from `./dist/index.js`
- the `./store/kv` subpath still resolves (`createKVTransferStore` present)
- no `react`/`.tsx` export (only comment references — D-13 satisfied)
- no `store/kv`/`kv.js` export in the main entry (only comments — D-11 satisfied)

### Task 2 — headline E2E roundtrip + THREAT-07 (`roundtrip.e2e.test.ts`) — commit `cfda50a`

The first complete end-to-end flow on the pure-Node bench, one test asserting the whole chain:

1. **Bridge (real handler):** a verified session + chunked session-token cookies → `200 { code }`, `code` matches `/^[0-9a-f]{64}$/`.
2. **postMessage simulation (D-11):** the bridge's `{ code }` is shaped into the exact `{ source: 'next-auth-bridge', type: 'auth-success', code }` the popup would post, routed through the **real** `isTrustedMessage` predicate (origin allowlist + pinned source identity), and the handle is extracted only after the trust check passes.
3. **Consume (real handler):** the opener constructs `/auth/consume?code=<code>&next=/home` (GET-fetch transport, D-14) → `302` to the sanitized `next` with one `Partitioned` `Set-Cookie` per chunk whose `name=value` round-trips the harvested chunks exactly. Set-Cookie read via `getSetCookie()` only.
4. **THREAT-07 / D-15:** every client-constructed URL (bridge + consume) is swept — no session-token value appears in any; the opaque `code` is asserted **present** in the consume URL (proving the test forbids the token, not the handle).

The test header and inline comments document the D-11 honesty boundary: `Partitioned` **emission** + the data flow are asserted; real CHIPS partition enforcement is a Phase 4 browser check.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - no stub patterns introduced (this plan wires existing symbols and adds a real end-to-end test against real handlers).

## Threat Flags

None - this plan introduces no new security surface. It re-exports already-reviewed symbols and adds a test that asserts the existing THREAT-07 property at the client URL seam. No new endpoints, auth paths, file access, or schema changes.

## Verification evidence

- `pnpm test -- roundtrip` → 1 file / 1 test passed.
- `pnpm test` (full suite) → 12 files / 96 tests passed (Phase 1/2/3 all green).
- `pnpm build` → exit 0; `dist/index.js` exposes all five Phase 3 functions; `./store/kv` subpath resolves (`createKVTransferStore`).
- D-13 / D-11 grep guards: no `react`/`.tsx` export and no `store/kv` export in the main entry (matches are comment-only).

## Self-Check: PASSED

- FOUND: `packages/core/src/index.ts`
- FOUND: `packages/core/src/__tests__/roundtrip.e2e.test.ts`
- FOUND commit: `653c483` (feat — public surface)
- FOUND commit: `cfda50a` (test — e2e roundtrip)
