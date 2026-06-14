# Roadmap: next-auth-bridge

## Overview

The journey builds Mode A (popup-bridge) cross-context authentication from the inside out, foundation-first. The highest-leverage decision — the `transferStore` interface — is designed once against two real adapters (Phase 1), then the server-side routes that mint and consume opaque handles are built on it (Phase 2), then the client surfaces and middleware that drive the flow (Phase 3). The first working end-to-end flow lands on the Vitest test bench at the end of Phase 3. Phase 4 hardens the whole roundtrip and writes the canonical threat model. Phase 5 proves it in the real world with a multi-tenant Entra reference app deployed to Vercel preview. Phase 6 ships it: semantic-release, npm publish, branch protection, and an Auth.js docs recipe. Security tests are colocated to the layer that produces them — every phase ships with its mapped negative-case coverage, never deferred.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: TransferStore & Adapters** - Mode-agnostic handle store interface with in-memory and Vercel KV adapters, plus entropy/one-time-use/TTL negative tests
- [x] **Phase 2: Bridge & Consume Routes** - Server-side `/auth/bridge` and `/auth/consume` handlers + config factory, with session-independence, PKCE, partitioned-cookie, and sanitizeNext negative tests
- [x] **Phase 3: Client Helpers, Pages & Middleware** - Popup page, `openAuthPopup`, open-union `detectContext`, and context-routing middleware; first end-to-end flow on the test bench (completed 2026-06-08)
- [x] **Phase 4: Threat Model & Roundtrip Hardening** - `docs/threat-model.md` plus the full iframe to partitioned-cookie integration roundtrip and URL-hygiene closure tests
- [ ] **Phase 5: Multi-Tenant Reference Example** - Multi-tenant Entra App Router example deployed to Vercel preview, generic-OIDC CI proof, and inert Mode B preview scaffolding
- [x] **Phase 6: Release Engineering** - semantic-release, npm publish CI, commit-msg hook, license headers, branch protection, and the Auth.js docs recipe PR (completed 2026-06-14)

## Phase Details

### Phase 1: TransferStore & Adapters

**Goal**: A mode-agnostic handle store exists with two working backends — one for the test bench, one for Vercel serverless — and its security invariants are proven directly against the store.
**Depends on**: Nothing (first phase)
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06
**Success Criteria** (what must be TRUE):

  1. A `TransferStore` interface exposes `create(payload)`, `consume(code)`, and TTL semantics with no popup/PWA-specific fields on stored entries (mode-agnostic — survives into v0.2 unchanged)
  2. The in-memory adapter satisfies the interface and is usable by Vitest with no external dependency; the Vercel KV adapter satisfies the same interface for cross-invocation state
  3. Generated codes are 256-bit CSPRNG hex (entropy test passes against the store directly)
  4. A second `consume` of any code fails because the code is deleted on first read (one-time-use negative test passes)
  5. A code older than its TTL (≤ 60s) fails `consume` (expiry negative test passes)

**Plans**: 3 plans in 2 waves
Plans:

- **Wave 1:**
  - [x] 01-01-PLAN.md — Package skeleton + locked TransferStore interface + single-site code generation + shared contract suite + clock-aware FakeUpstashRedis
- **Wave 2** *(blocked on Wave 1 completion; 01-02 and 01-03 run in parallel — disjoint files):*
  - [x] 01-02-PLAN.md — In-memory adapter (lazy-expiry, atomic delete-on-read, ttl guard); contract suite + STORE-02/05/06 negative tests
  - [x] 01-03-PLAN.md — KV adapter on @upstash/redis at the ./store/kv subpath (native set({ex}) + atomic getdel); contract suite vs FakeUpstashRedis + subpath build proof

**Cross-cutting constraints:** the shared contract suite (D-15) runs against both adapters; codes are 256-bit CSPRNG from one entropy site (D-01); `consume()` is atomic read-and-delete then validate (D-09); TTL ≤ 60s enforced at construction (D-07).

### Phase 2: Bridge & Consume Routes

**Goal**: The server-side handoff works — `/auth/bridge` mints opaque handles only for genuinely authenticated requests, and `/auth/consume` exchanges them for a correctly-attributed partitioned cookie — wired by a reusable config factory.
**Depends on**: Phase 1
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, ROUTE-06
**Success Criteria** (what must be TRUE):

  1. `/auth/bridge` mints a handle only after independently verifying a real Auth.js session; a request without a valid session is refused regardless of any context/wrapper signal (THREAT-04 negative test passes)
  2. `/auth/bridge` returns only an opaque handle — no session token appears in the response body or any URL it produces
  3. `/auth/consume` exchanges a valid handle and sets a CHIPS cookie with `partitioned: true` and the correct attributes; a forged or already-consumed handle is rejected (THREAT-06 test passes)
  4. PKCE state survives the bridge handoff intact — the bridge does not break the Auth.js-managed PKCE exchange (THREAT-05 test passes)
  5. A config factory wires both routes from app-specific options (cookie name, store adapter, allowed origins), and `sanitizeNext` rejects redirect targets inside `/auth` and `/api/auth` (THREAT-08 test passes)

**Plans**: 3 plans in 3 waves
Plans:

- **Wave 1:**
  - [x] 02-01-PLAN.md — Foundation: TransferPayload reshape to chunk-array (D-01) + Phase 1 fixture repair; `sanitizeNext`/`getAuthCookieName` (ROUTE-06/THREAT-08, D-16); hand-rolled cookie codec (`parseCookieHeader`/`serializeSetCookie`, D-03/D-17); route/option types (`AuthBridgeOptions`/`VerifySession`, D-04/D-11) + shared test fixtures (Wave 0)
- **Wave 2** *(blocked on Wave 1):*
  - [x] 02-02-PLAN.md — `/auth/bridge` handler: session-gate-first 401 (ROUTE-01/THREAT-04), opaque-handle-only 200 with zero cookies (ROUTE-02/AM-2), session-token chunk harvest excluding PKCE/state/csrf/callback-url decoys (ROUTE-04/THREAT-05/D-05), empty-harvest 5xx (D-15), Origin allowlist (D-12/D-14)
- **Wave 3** *(blocked on Wave 2 — the factory imports the bridge builder):*
  - [x] 02-03-PLAN.md — `/auth/consume` handler (partitioned CHIPS Set-Cookie per chunk via factored writer — ROUTE-03/D-13; forged/replayed/absent handle → 4xx no-cookie — THREAT-06/AM-1; Max-Age opt-in — D-17) + `createAuthBridge` factory (ROUTE-05/D-10) + extended public re-exports

### Phase 3: Client Helpers, Pages & Middleware

**Goal**: The client surfaces that drive the flow exist and connect to the routes, producing the first complete iframe to partitioned-cookie flow on the Vitest test bench.
**Depends on**: Phase 2
**Requirements**: CLIENT-01, CLIENT-02, CLIENT-03, CLIENT-04, CLIENT-05
**Success Criteria** (what must be TRUE):

  1. The `/auth/popup` page completes the popup flow and signals its opener via `postMessage`; `openAuthPopup` opens the popup and enforces `postMessage` origin checks on receipt — a message from a wrong origin is rejected (THREAT-03 test passes)
  2. `detectContext` returns the open-union type `'iframe' | 'browser' | 'pwa-shell'` and callsites use default-fallback (not exhaustive switch), so v0.2 can wire Mode B without changing the public type
  3. Middleware routes by detected context for UX only and never gates security on the detection result
  4. No session token appears in any URL the client constructs across the popup flow (THREAT-07 test passes)
  5. The first end-to-end flow (iframe to consumed handle to partitioned cookie) runs green on the Vitest test bench

**Plans**: 4 plans in 3 waves
Plans:

- **Wave 1:**
  - [x] 03-01-PLAN.md — Leaf pure functions: `isTrustedMessage` (THREAT-03 origin+source predicate, zero DOM — D-02/D-12) + `detectContext` (open-union client detector, default-fallback — D-05/D-06/D-07) + shared DI-fake test helpers for Wave 2/3 (CLIENT-02, CLIENT-03)
- **Wave 2** *(blocked on 03-01; 03-02 and 03-03 run in parallel — disjoint files):*
  - [x] 03-02-PLAN.md — `runPopupFlow` (popup-side: fetch `/auth/bridge` → postMessage `{ code }` to opener with explicit targetOrigin — CLIENT-01/D-01/D-02/D-03) + `createBridgeMiddleware` (store-free/crypto-free context router; rewrite embedded→popup-entry, UX-only, structural edge-safe assertion — CLIENT-04/D-08/D-09/D-10/D-16)
  - [x] 03-03-PLAN.md — `openAuthPopup` (opener-side promise: resolve `{ code }` on trusted message via `isTrustedMessage`; typed rejections on auth-error/popup-closed/timeout; cleanup-on-settle — CLIENT-02/D-04/D-12)
- **Wave 3** *(blocked on Waves 1-2 — wires the surface and drives all symbols + the real Phase 2 handlers):*
  - [x] 03-04-PLAN.md — Public-surface wiring (`index.ts` re-exports the four functions + `BridgeContext`, middleware stays main-entry separate symbol — D-13/D-16) + headline E2E roundtrip (iframe→bridge→consume→`Partitioned` cookie on the pure-Node bench, function-level postMessage sim — D-11/D-14) + THREAT-07 token-vs-handle URL hygiene (CLIENT-05/D-15)

**Deviation note (D-13):** v0.1 ships only the framework-agnostic `runPopupFlow(deps)` — NO `.tsx`, NO React, NO JSX config. The actual `/auth/popup` page component is deferred to the Phase 5 example app. This is an intentional departure from the `popup-page.tsx` pointer in CLAUDE.md (architecture pointers), keeping the package React-free for v0.1.

### Phase 4: Threat Model & Roundtrip Hardening

**Goal**: The complete Mode A security story is written down and proven end-to-end — every invariant has a documented entry and a passing integration test, with the no-token-in-URL property closed at roundtrip level.
**Depends on**: Phase 3
**Requirements**: HARDEN-01, HARDEN-02, HARDEN-03
**Success Criteria** (what must be TRUE):

  1. `docs/threat-model.md` enumerates every Mode A security property and maps each invariant to a specific test that proves it
  2. A single-origin integration test simulates the full iframe to popup to bridge to consume to partitioned-cookie roundtrip and passes (THREAT-01)
  3. An integration assertion confirms no Auth.js session token appears in any URL across the entire flow, closing THREAT-09 / THREAT-10 at the roundtrip level

**Plans**: 2 plans in 2 waves
Plans:

- **Wave 1:**
  - [x] 04-01-PLAN.md — Harden roundtrip.e2e.test.ts in place: drive the REAL openAuthPopup + runPopupFlow via DI fakes, fold in replay + wrong-origin/source negatives, keep the URL-hygiene sweep, reconcile T-03-NN comments to THREAT-NN (HARDEN-02/HARDEN-03)
- **Wave 2** *(blocked on 04-01 — every doc row must cite a green test the hardened roundtrip produces):*
  - [x] 04-02-PLAN.md — Author docs/threat-model.md (THREAT-NN-keyed invariant registry, each row property→mitigation→green test::name) + redirect CLAUDE.md pointer to threat-model.md (HARDEN-01)

### Phase 5: Multi-Tenant Reference Example

**Goal**: The bridge is proven in a realistic enterprise-B2B shape — a multi-tenant Entra app on a live Vercel preview using the KV adapter — with provider-agnosticism demonstrated in CI and the Mode B entry point scaffolded inert.
**Depends on**: Phase 4
**Requirements**: EXAMPLE-01, EXAMPLE-02, EXAMPLE-03, EXAMPLE-04
**Success Criteria** (what must be TRUE):

  1. A multi-tenant App Router example demonstrates the popup roundtrip end-to-end across more than one tenant
  2. The example is deployed to a Vercel preview against a real Microsoft Entra app registration using the Vercel KV adapter, and the roundtrip works live (in-memory would fail by construction on serverless)
  3. CI exercises the bridge mechanics against a generic OIDC provider (Keycloak / Auth.js test provider) in addition to Entra, catching accidental Entra-specific coupling
  4. The `/install-pwa` route serves a valid per-tenant `application/manifest+json` response per request and is clearly labeled inert "Mode B preview" scaffolding — present so v0.2 has its PWA installation entry point, with no Mode B auth flow wired

**Plans**: 5 plans in 4 waves
**UI hint**: yes
Plans:

- **Wave 1:**
  - [x] 05-01-PLAN.md — tenant-app workspace scaffold + Auth.js v5 multi-tenant Entra (/common, tid) + createAuthBridge bridge/consume wiring on the KV store + the /auth/popup React page + context-routing middleware + .env.example
- **Wave 2** *(blocked on 05-01; 05-02 and 05-03 run in parallel — disjoint files):*
  - [x] 05-02-PLAN.md — Dynamic per-tenant manifest route (per-request application/manifest+json, force-dynamic) + inert labeled /install-pwa "Mode B preview" page + Vitest config + manifest negative-case test (EXAMPLE-04)
  - [x] 05-03-PLAN.md — Swappable consume-transport seam (fetch active, navigation fallback) + opener sign-in component (openAuthPopup -> redeemHandle) + >=2 per-tenant landing pages + frame-ancestors policy + SEPARATE cross-site host-shell app (distinct origin, EXAMPLE-01 mechanics)
- **Wave 3** *(blocked on 05-01 — drives the real bridge/consume against a non-Entra session):*
  - [x] 05-04-PLAN.md — Browserless auth-code+PKCE (S256) Keycloak login helper (no ROPC) + bridge->consume roundtrip test (Partitioned + replay negative) + realm-export (ROPC disabled) + GitHub Actions Keycloak service job with pinned 26.x image + readiness poll (EXAMPLE-03)
- **Wave 4** *(blocked on 05-02/03/04 — live observation needs the cross-site deploy + green CI; HUMAN CHECKPOINT):*
  - [ ] 05-05-PLAN.md — Live two-origin Vercel/Entra deploy (KV-backed) + manual cross-site CHIPS partition observation + D-10 transport decision + close the THREAT-06 honesty boundary in docs/threat-model.md (EXAMPLE-01/02, autonomous: false)

### Phase 6: Release Engineering

**Goal**: The package is publishable and governed — versioned releases flow automatically from Conventional Commits, the published surface is protected, and the ecosystem has a discovery path via the Auth.js docs recipe.
**Depends on**: Phase 5
**Requirements**: RELEASE-01, RELEASE-02, RELEASE-03, RELEASE-04, RELEASE-05
**Success Criteria** (what must be TRUE):

  1. semantic-release is configured so a merge to `main` derives the next version from commit types and produces a tag, npm publish, CHANGELOG entry, and GitHub Release
  2. A GitHub Actions workflow publishes `next-auth-bridge` to npm on merge to `main` using `NPM_TOKEN`
  3. A commit-msg hook rejects non-Conventional-Commits messages locally before push
  4. MIT is declared via the root `LICENSE` + `package.json` `"license"` field (no per-file headers — see CLAUDE.md), and `main` has branch protection blocking direct pushes
  5. An Auth.js docs recipe PR for the bridge pattern is opened against authjs.dev

**Carried-in concern (from Phase 1):** migrate build tooling `tsup` → `tsdown`. tsup is unmaintained and its README directs users to tsdown (Rolldown-team successor, tsup-compatible options). Do it here so the publish pipeline is validated against the new bundler in one pass. Isolated change: `packages/core/tsup.config.ts` (2 entries, esm/dts/clean), the `build` script, and the devDep; re-verify `dist/index.js` + `dist/store/kv.{js,d.ts}` emit and the `./store/kv` subpath resolves. Confirm tsdown is ≥1.0 (or accept its then-current pre-1.0 state explicitly) before adopting.

**Plans**: 4 plans in 3 waves
Plans:

- **Wave 1** *(disjoint files — run in parallel):*
  - [x] 06-01-PLAN.md — Build tooling: migrate tsup → tsdown (D-06), preserve the two-entry ESM+dts surface, strip internal markers, + Wave 0 dist-parity smoke test (`./store/kv` resolves post-migration)
  - [x] 06-03-PLAN.md — CI + governance: hand-rolled `.githooks/commit-msg` (D-04) + subprocess-driven test (RELEASE-03), publish workflow with provenance/Node-22/`id-token: write` (RELEASE-02), PR-title check (D-05)
- **Wave 2** *(blocked on 06-01 — shares `packages/core/package.json`):*
  - [x] 06-02-PLAN.md — Publish metadata + semantic-release: D-03 publish hygiene (files allowlist, provenance, engines >=18, repo/keywords), root `.releaserc.json` (six-plugin chain, `pkgRoot packages/core`, keep-git), root deps → devDeps cleanup (RELEASE-01)
- **Wave 3** *(blocked on 06-01/02/03 — human gates; autonomous: false):*
  - [x] 06-04-PLAN.md — Release safety + docs: D-02 dry-run/pack human gate, branch-protection recipe + maintainer apply (RELEASE-04), Auth.js recipe MDX + cross-repo PR (RELEASE-05)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. TransferStore & Adapters | 3/3 | Complete | 2026-06-05 |
| 2. Bridge & Consume Routes | 3/3 | Complete    | 2026-06-07 |
| 3. Client Helpers, Pages & Middleware | 4/4 | Complete    | 2026-06-08 |
| 4. Threat Model & Roundtrip Hardening | 0/TBD | Not started | - |
| 5. Multi-Tenant Reference Example | 4/5 | In Progress|  |
| 6. Release Engineering | 4/4 | Complete    | 2026-06-14 |
