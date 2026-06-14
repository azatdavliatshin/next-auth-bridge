# Requirements: next-auth-bridge

**Defined:** 2026-06-05
**Core Value:** The popup-bridge (Mode A) pattern works end-to-end and is *deeply correct* — every threat-model invariant holds under negative-case test coverage.

> **Namespace note:** `THREAT-NN` refers *exclusively* to the threat-model invariants enumerated in `docs/architecture.md` / `docs/threat-model.md` (entropy, one-time-use, no-token-in-URL, PKCE, postMessage origin, partitioned cookie, sanitizeNext, etc.). Requirement IDs use category prefixes (`STORE`, `ROUTE`, `CLIENT`, `HARDEN`, `EXAMPLE`, `RELEASE`). The Phase 4 hardening requirements use the `HARDEN-` prefix specifically to avoid colliding with inline `THREAT-NN` invariant references.

## v1 Requirements

Requirements for the v0.1.0 release. Mode A only, deeply correct. Each maps to exactly one roadmap phase.

### Store (transferStore)

- [x] **STORE-01**: A `TransferStore` interface defines `create(payload)`, `consume(code)`, and TTL semantics, mode-agnostic (no popup/PWA-specific fields). *Forward-compat constraint: preserved verbatim in v0.2; adding native-callback handles must not introduce mode discriminators on stored entries.*
- [x] **STORE-02**: In-memory adapter implements the interface for the test bench (single-instance; sufficient for unit/integration/threat-model tests, not for Vercel serverless)
- [x] **STORE-03**: Vercel KV adapter implements the interface for cross-invocation state on Vercel serverless (production backend for the reference app)
- [x] **STORE-04**: Codes are 256-bit CSPRNG hex (THREAT-02 — entropy)
- [x] **STORE-05**: Codes are one-time-use — deleted on first read; a second `consume` of the same code fails (THREAT-02 — one-time-use)
- [x] **STORE-06**: Codes expire after a TTL ≤ 60s; expired codes fail `consume` (THREAT-02 — TTL)

### Routes (bridge & consume)

- [x] **ROUTE-01**: `/auth/bridge` independently verifies a real Auth.js session before minting a handle (THREAT-04 — wrapper/context detection is UX routing, not a security boundary)
- [x] **ROUTE-02**: `/auth/bridge` (popup mode) returns only an opaque handle — no session token in the response or any URL (contributes to closing THREAT-09 — full closure verified in HARDEN-03 integration test)
- [x] **ROUTE-03**: `/auth/consume` exchanges a valid handle and sets a CHIPS partitioned cookie (`partitioned: true`) with correct attributes (THREAT-06)
- [x] **ROUTE-04**: PKCE is preserved through the bridge handoff (Auth.js-managed; verified not broken by the bridge) (THREAT-05)
- [x] **ROUTE-05**: A config factory wires the routes with app-specific options (cookie name, store adapter, allowed origins)
- [x] **ROUTE-06**: `sanitizeNext` rejects redirect targets inside `/auth` and `/api/auth` (THREAT-08)

### Client (helpers, pages & middleware)

- [x] **CLIENT-01**: `/auth/popup` client page completes the popup flow and signals the opener via `postMessage`
- [x] **CLIENT-02**: `openAuthPopup` helper opens the popup and enforces `postMessage` origin checks on receipt (THREAT-03)
- [x] **CLIENT-03**: `detectContext` returns an open-union (forward-compat) discriminating context. *Acceptance: public return type is `'iframe' | 'browser' | 'pwa-shell'` even though v0.1 never returns `'pwa-shell'`; callsites use default-fallback, not an exhaustive switch, so v0.2 wires Mode B without modifying the public type.*
- [x] **CLIENT-04**: Middleware routes by detected context (UX routing only, not a security gate)
- [x] **CLIENT-05**: Client-side URL hygiene — no session token placed in any URL the client constructs (THREAT-07)

### Hardening (threat model & roundtrip)

- [x] **HARDEN-01**: `docs/threat-model.md` enumerates all Mode A security properties with a mapped test for each invariant
- [x] **HARDEN-02**: End-to-end Vitest integration test simulates the iframe → popup → bridge → consume → partitioned-cookie roundtrip on a single origin (THREAT-01)
- [x] **HARDEN-03**: Integration test confirms no Auth.js session token appears in any URL across the full flow (closes THREAT-09 / THREAT-10 at roundtrip level)

### Example (multi-tenant reference)

- [ ] **EXAMPLE-01**: Multi-tenant App Router example demonstrates the popup roundtrip end-to-end
- [ ] **EXAMPLE-02**: Example deploys to a Vercel preview against a real Microsoft Entra app registration (using the Vercel KV adapter)
- [ ] **EXAMPLE-03**: Provider-agnostic proof — bridge mechanics tested in CI against a generic OIDC provider (Keycloak / Auth.js test provider)
- [ ] **EXAMPLE-04**: Per-tenant dynamic PWA manifest + `/install-pwa` route present as inert, labeled "Mode B preview" scaffolding. *Constraint: route serves a valid `application/manifest+json` response per request; no Mode B auth flow is wired. Removing this route in v0.1 would break the v0.2 PWA installation entry point.*

### Release (engineering)

- [x] **RELEASE-01**: semantic-release configured — Conventional Commits drive version, tag, npm publish, CHANGELOG, GitHub Release
- [x] **RELEASE-02**: GitHub Actions workflow publishes to npm on merge to `main` (with `NPM_TOKEN`)
- [x] **RELEASE-03**: commit-msg hook validates Conventional Commits format locally
- [x] **RELEASE-04**: MIT license headers in new files under `packages/`; branch protection on `main`
- [x] **RELEASE-05**: Auth.js docs recipe PR opened against authjs.dev

## v2 Requirements

Deferred to future release. Tracked but not in the current roadmap.

### Mode B

- **MODEB-01**: PWA-shell transport via `ASWebAuthenticationSession` (`prefersEphemeralWebBrowserSession = false`) for PWABuilder-wrapped iOS apps. *Additive on the v0.1 transferStore interface — no breaking change.*

### Store

- **STORE-07**: Upstash adapter — second non-Vercel proof of the pluggable interface (self-hosted Next.js, Cloudflare Workers via Upstash Redis)

### Example

- **EXAMPLE-05**: Minimal popup-only example app for Teams Tab / SharePoint iframe scenarios without PWA wrapping

## Out of Scope

Explicitly excluded from v0.1.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mode B (iOS / `ASWebAuthenticationSession`) | Validation needs real iOS hardware; Mode A needs downstream soak time. Deferred to v0.2. |
| Upstash adapter | Pluggability already proven by in-memory + Vercel KV (two concrete impls). Deferred to v0.1.x/v0.2. |
| Minimal popup-only example app | README quick-start + Auth.js recipe markdown already serve the "minimal start" need. Deferred to v0.1.x. |
| Host-specific integration tooling (SharePoint web part, Teams Tab manifest, Salesforce Canvas) | Host-side concern, not bridge mechanics. From the bridge's view, the host is "any page that hosts an iframe and supports window.open + postMessage". Documented as compatible with caveats. |
| Real-host validation (community embed report) | This is the v0.1.x *validation* milestone (`VALID-01/02`), not an engineering-completion gate. Engineering completion is not blocked on external adoption. |
| Functional Mode B in reference app (per-tenant manifest / install-pwa) | Kept as inert, labeled "Mode B preview" scaffolding only (see EXAMPLE-04). |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | Phase 1 | Complete |
| STORE-02 | Phase 1 | Complete |
| STORE-03 | Phase 1 | Complete |
| STORE-04 | Phase 1 | Complete |
| STORE-05 | Phase 1 | Complete |
| STORE-06 | Phase 1 | Complete |
| ROUTE-01 | Phase 2 | Complete |
| ROUTE-02 | Phase 2 | Complete |
| ROUTE-03 | Phase 2 | Complete |
| ROUTE-04 | Phase 2 | Complete |
| ROUTE-05 | Phase 2 | Complete |
| ROUTE-06 | Phase 2 | Complete |
| CLIENT-01 | Phase 3 | Complete |
| CLIENT-02 | Phase 3 | Complete |
| CLIENT-03 | Phase 3 | Complete |
| CLIENT-04 | Phase 3 | Complete |
| CLIENT-05 | Phase 3 | Complete |
| HARDEN-01 | Phase 4 | Complete |
| HARDEN-02 | Phase 4 | Complete |
| HARDEN-03 | Phase 4 | Complete |
| EXAMPLE-01 | Phase 5 | Pending |
| EXAMPLE-02 | Phase 5 | Pending |
| EXAMPLE-03 | Phase 5 | Pending |
| EXAMPLE-04 | Phase 5 | Pending |
| RELEASE-01 | Phase 6 | Complete |
| RELEASE-02 | Phase 6 | Complete |
| RELEASE-03 | Phase 6 | Complete |
| RELEASE-04 | Phase 6 | Complete |
| RELEASE-05 | Phase 6 | Complete |

**Coverage:**

- v1 requirements: 29 total
- Mapped to phases: 29 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-05*
*Last updated: 2026-06-05 after roadmap creation (traceability populated, 100% coverage)*
