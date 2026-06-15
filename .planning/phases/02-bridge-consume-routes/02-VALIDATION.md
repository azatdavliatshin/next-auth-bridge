---
phase: 02
slug: bridge-consume-routes
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-05
revised: 2026-06-05
validated: 2026-06-07
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Revised 2026-06-05** to track the re-planned waves (cookie-codec moved to Wave 1; consume + factory in Wave 3) and the review-addendum decisions D-14 (Origin semantics), D-15 (empty-harvest 5xx), D-16 (`secure` reachability), D-17 (Max-Age), and mandates AM-1 (absent/empty `code`), AM-2 (bridge sets zero cookies). Map now matches the three regenerated plans.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.8 (`environment: "node"`) |
| **Config file** | `packages/core/vitest.config.ts` (`include: ["src/**/*.test.ts"]`) |
| **Quick run command** | `pnpm test <touched file>` (from `packages/core`, runs `vitest run`) |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds (node env, in-memory store, no real waits) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test src/__tests__/<file>.test.ts` (the touched file)
- **After every plan wave:** Run `pnpm test` (full core suite — includes updated Phase 1 contract tests)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T2 | 01 | 1 | ROUTE-06 | THREAT-08 | `sanitizeNext` degrades `/auth*`, `/api/auth*`, absolute, `//evil` → `/`; never honors the unsafe target | unit | `pnpm test src/__tests__/auth-helpers.test.ts` | ✅ exists | ✅ green |
| 02-01-T2 | 01 | 1 | ROUTE-05 | — | `getAuthCookieName` resolves `__Secure-authjs.session-token` default / explicit `cookieName` override | unit | `pnpm test src/__tests__/auth-helpers.test.ts` | ✅ exists | ✅ green |
| 02-01-T2 | 01 | 1 | ROUTE-05 | — | **D-16:** `getAuthCookieName({ secure: false })` reaches the non-prefixed `authjs.session-token` (dev/http) | unit | `pnpm test src/__tests__/auth-helpers.test.ts` | ✅ exists | ✅ green |
| 02-01-T1 | 01 | 1 | (regression) D-01 | — | Phase 1 contract + in-memory + kv fixtures updated to `{name,value}[]` payload still pass; no `authCookieValue` in `src/` | unit | `pnpm test src/transfer-store/__tests__/` | ✅ updated | ✅ green |
| 02-02-T1/2 | 02 | 2 | ROUTE-01 | THREAT-04 | No session → `401`, no handle minted; wrapper/`?popup=true` signal ignored | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-02-T1/2 | 02 | 2 | ROUTE-02 | — | Success → `200 { code }`; body contains no token / no JWT-shaped string | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-02-T1/2 | 02 | 2 | ROUTE-04 | THREAT-05 | Bridge never reads/writes `*pkce*` / `*state*` cookies (PKCE not disturbed) | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-02-T1/2 | 02 | 2 | AM-2 | THREAT-05 | Bridge success response sets ZERO cookies — `getSetCookie()` is `[]` (the "never written" half) | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-02-T1/2 | 02 | 2 | D-05 | — | Harvest only session-token base + `.N` chunks; csrf/pkce/state/callback-url decoys excluded | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-02-T1/2 | 02 | 2 | D-15 | — | Verified session but no matching chunk → `5xx`, `store.create` never called | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-02-T1/2 | 02 | 2 | D-12 / **D-14** | — | Present-but-disallowed Origin → `4xx`; **absent Origin → proceeds** (defense-in-depth, not boundary) | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ✅ exists | ✅ green |
| 02-03-T1/2 | 03 | 3 | ROUTE-03 | — | Valid handle → `302` + partitioned `Set-Cookie` per chunk (Secure / HttpOnly / SameSite=None / Path=/ / Partitioned) | unit | `pnpm test src/__tests__/consume-route.test.ts` | ✅ exists | ✅ green |
| 02-03-T1/2 | 03 | 3 | ROUTE-03 (neg) | THREAT-06 | Forged / already-consumed handle → `4xx`, NO `Set-Cookie` | unit | `pnpm test src/__tests__/consume-route.test.ts` | ✅ exists | ✅ green |
| 02-03-T1/2 | 03 | 3 | AM-1 | — | Absent / empty `code` → same `4xx` no-cookie path; `store.consume` NOT called with null/empty | unit | `pnpm test src/__tests__/consume-route.test.ts` | ✅ exists | ✅ green |
| 02-03-T1/2 | 03 | 3 | ROUTE-03 / **D-17** | — | Default omits `Max-Age`; `maxAge: n` option → every `Set-Cookie` carries `Max-Age=n` | unit | `pnpm test src/__tests__/consume-route.test.ts` | ✅ exists | ✅ green |
| 02-03-T2 | 03 | 3 | ROUTE-05 | — | `createAuthBridge(options)` returns `{ bridge, consume }` wired from shared config; bridge→consume round-trips on the bench | unit | `pnpm test src/__tests__/consume-route.test.ts` | ✅ exists | ✅ green |
| 02-03-T1/2 | 03 | 3 | D-12 / **D-14** | — | Present-but-disallowed Origin → `4xx` on consume; absent Origin → proceeds | unit | `pnpm test src/__tests__/consume-route.test.ts` | ✅ exists | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs map to the regenerated plans: `02-<plan>-T<task>`. Wave order: W1 = Plan 01 (payload reshape + pure helpers/codec/types/fixtures), W2 = Plan 02 (bridge), W3 = Plan 03 (consume + factory + barrel). Plan 01 also unit-asserts `serializeSetCookie` hardened floors + Max-Age omission (D-17 at the codec level) inside its tsc/acceptance gate; the runtime D-17 default/opt-in is exercised end-to-end in `consume-route.test.ts`.*

---

## Wave 0 Requirements

Wave 0 is folded into **Wave 1 (Plan 01)** — the shared fixtures, pure helpers, codec, and types all ship there before the route tests in W2/W3 import them.

- [x] `src/__tests__/helpers.ts` — shared fixtures: `makeRequest`, `fakeVerifySession`, in-memory store wiring (`createInMemoryTransferStore`) — Plan 01 Task 3
- [x] `src/auth-helpers.ts` + `src/__tests__/auth-helpers.test.ts` — `sanitizeNext` (ROUTE-06/THREAT-08) + `getAuthCookieName` resolution incl. `secure` (ROUTE-05/D-16) — Plan 01 Task 2
- [x] `src/cookie-codec.ts` — `parseCookieHeader` + `serializeSetCookie` (hardened floors + Max-Age omission, D-03/D-17); `harvestSessionChunks` here or inline in bridge (Plan 01 SUMMARY records which) — Plan 01 Task 3
- [x] `src/types.ts` — `AuthBridgeOptions` (with `secure?`/`maxAge?` — D-16/D-17) + `VerifySession` — Plan 01 Task 3
- [x] `src/__tests__/bridge-route.test.ts` — ROUTE-01/02/04, D-05, D-12/D-14, D-15, AM-2 — Plan 02
- [x] `src/__tests__/consume-route.test.ts` — ROUTE-03 (+negatives/THREAT-06), AM-1, D-17, ROUTE-05/D-10, D-12/D-14 — Plan 03
- [x] Update `src/transfer-store/__tests__/contract.ts` (line ~56), `in-memory.test.ts`, `kv.test.ts` (lines ~137-138) fixtures to the new `TransferPayload` `{name,value}[]` shape (D-01) — Plan 01 Task 1
- Framework install: none — Vitest already configured.

*Test style mandate (from Phase 1): inject `createInMemoryTransferStore` (no KV); use the clock seam where TTL matters; deterministic, no real waits/timers; tag security tests with `THREAT-04` / `THREAT-06` / `THREAT-08` comments for Phase 4 traceability. Consume tests MUST read cookies via `response.headers.getSetCookie()`, never `.get("Set-Cookie")` (multiple chunked cookies are special-cased by the Fetch API).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real CHIPS partitioning enforced by a browser across an actual iframe boundary | ROUTE-03 | Vitest node env cannot exercise the browser's cookie-partition store; unit tests assert the `Partitioned` attribute is emitted, not that the browser honors it | Deferred to Phase 4 roundtrip integration + manual enterprise-host smoke test |

*Unit tests fully cover attribute emission and all negative/security cases. Only real-browser partition enforcement is manual, and it belongs to Phase 4.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (use `vitest run`, not `vitest`)
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-05; **re-synced 2026-06-05** to the regenerated plans (waves corrected; D-14/D-15/D-16/D-17 + AM-1/AM-2 rows added). No new test infrastructure — re-approval not required.

---

## Validation Audit 2026-06-07

Post-execution Nyquist audit (State A — audit existing map against delivered tests). Every requirement row was cross-referenced against the test files actually on disk and a live `pnpm test` run.

| Metric | Count |
|--------|-------|
| Requirements in map | 16 |
| COVERED (asserting test, green) | 16 |
| PARTIAL / MISSING | 0 |
| Gaps filled this audit | 0 (none needed) |

**Result:** `nyquist_compliant: true` confirmed. All 16 mapped behaviors have an automated, asserting, passing test. No `gsd-nyquist-auditor` test generation was required.

**Live evidence:** `pnpm test` (from `packages/core`) → **6 files / 61 tests passing** (`auth-helpers` 14, `bridge-route` 7, `consume-route` 14, plus the updated `transfer-store` contract/in-memory/kv suites). Includes the CR-01 backslash open-redirect negative cases (`auth-helpers.test.ts`) and the AM-1/THREAT-06 store-never-reached assertions via recording-store wrappers.

**Manual-only (unchanged):** real-browser CHIPS partition *enforcement* across an actual iframe boundary remains a Phase 4 roundtrip/manual item — unit tests cover attribute *emission*, which is the testable half here.
