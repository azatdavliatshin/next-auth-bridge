# next-auth-bridge

## What This Is

A Next.js / Auth.js npm package (`next-auth-bridge`) that solves cross-context authentication for two recurring deployment shapes: Next.js apps embedded as iframes inside enterprise hosts (SharePoint, Teams Tab, Salesforce Lightning, ServiceNow) that already have an active OIDC session, and Next.js apps wrapped as native iOS via PWABuilder's pwa-shell template. Both share one architectural shape — a server-side handle store mediating one-time-code exchange across a trust boundary — exposed as a clean, pluggable package for the Auth.js + Next.js ecosystem.

It is library-first. The reference example apps in this repo are the only deterministic consumers at v0.1.0; real external adoption is a hypothesis tested post-publish through community channels and an Auth.js docs recipe.

## Core Value

The popup-bridge (Mode A) pattern works end-to-end and is *deeply correct* — every threat-model invariant holds under negative-case test coverage. Correctness of the security-critical handoff is the one thing that cannot fail; breadth of transports and hosts is secondary.

## Requirements

### Validated

(None yet — ship to validate)

### Active

<!-- v0.1.0 scope. Mode A only, deeply correct. -->

- [ ] Shared `transferStore` interface with in-memory adapter (test bench) and Vercel KV adapter (production / cross-invocation state on Vercel serverless)
- [ ] `/auth/bridge` handler — mints one-time opaque handle after independently verifying a real session (popup mode)
- [ ] `/auth/consume` handler — exchanges handle, sets CHIPS partitioned cookie (popup mode)
- [ ] `/auth/popup` client page + `openAuthPopup` helper with `postMessage` origin checks on both ends
- [ ] `detectContext` (open-union forward-compat return type) + middleware for context-based UX routing
- [ ] `auth-helpers` — `getAuthCookieName`, `sanitizeNext` (rejects `/auth`, `/api/auth` redirect targets)
- [ ] Negative-case Vitest coverage for all Mode A threat-model invariants (entropy, TTL, one-time-use, PKCE preservation, partitioned-cookie attributes, sanitizeNext, postMessage origin, no-token-in-URL)
- [ ] `docs/threat-model.md` enumerating Mode A security properties, with a test for each negative case
- [ ] Full end-to-end Vitest integration test: iframe → popup → bridge → consume → partitioned-cookie roundtrip on a single origin
- [ ] Multi-tenant reference example deployed to Vercel preview against a real Microsoft Entra app registration
- [ ] Provider-agnostic proof: bridge mechanics tested in CI against a generic OIDC provider (Keycloak / Auth.js test provider) in addition to Entra
- [ ] semantic-release pipeline live (Conventional Commits → version → tag → npm publish → CHANGELOG → GitHub Release), commit-msg hook, MIT license headers, branch protection on `main`
- [ ] Auth.js docs recipe PR opened against authjs.dev

### Out of Scope

<!-- Explicit boundaries for v0.1.0. -->

- Mode B (PWA-shell / `ASWebAuthenticationSession` / iOS) — deferred to v0.2; validation needs real iOS hardware and Mode A needs downstream soak time
- Upstash adapter — deferred to v0.1.x/v0.2; pluggability already proven by in-memory + Vercel KV
- Minimal popup-only example app — deferred to v0.1.x; README quick-start + recipe markdown already serve the "minimal starting point" need
- Host-specific integration tooling (SharePoint web part config, Teams Tab manifest, Salesforce Canvas) — host-side concern, not bridge mechanics; documented as compatible with caveats
- Real-host validation (community report of working embed in actual SharePoint/Teams/Salesforce) — this is the v0.1.x *validation* milestone, not gating engineering completion
- Per-tenant PWA manifest / `/install-pwa` route as functional Mode B — kept as inert, labeled "Mode B preview" scaffolding only

## Context

- **Why now:** The pattern keeps recurring. Enterprise iframe-distributed B2B SaaS is growing (especially Teams Tab apps), Google's passkey push makes the Mode B story timely, and the existing OSS ecosystem (Auth0 SDKs, Clerk SDKs, expo-auth-session, AppAuth) doesn't cover the Auth.js + Next.js + this-specific-combination niche. ~6–12 month window where this is genuinely valuable to publish.
- **Architecture is grounded, implementation is fresh:** The package is a clean-room rebuild of a production-proven architectural pattern, not extraction of any specific source code. The shape (server-side handle store, one-time-code exchange across a trust boundary) is what's grounded; code is written fresh from spec.
- **Adoption hypothesis & launch channels:** Soft launch on Auth.js Discord, r/nextjs, PWABuilder community, r/webauthn. Auth.js docs recipe PR. Technical article pitched to web.dev (passkey angle, post-v0.2) or InfoQ / The New Stack / Microsoft Developer Blog (enterprise-iframe-SSO angle, possible at v0.1.0).
- **First working flow lands in Phase 3** (routes connected to client surfaces on the Vitest test bench); deployable Vercel preview lands in Phase 5. The "no real end-to-end until late" cost is bounded because Phases 1–2 ship with isolated component tests.

## Constraints

- **Tech stack**: TypeScript `strict: true`, no `any` outside test scaffolding — package convention
- **Tech stack**: Next.js / Auth.js (Auth.js is a peer dependency) — the target ecosystem
- **Testing**: Vitest; in-memory adapter is non-negotiable because Vitest cannot depend on a real KV instance for unit/integration/threat-model tests
- **Deployment**: Vercel KV required for the reference app because serverless invocations don't share in-memory state — an in-memory store fails the roundtrip by construction on Vercel
- **Security**: Every change touching bridge/consume routes, transferStore, cookie attributes, or wrapper-detection requires a `threat-model.md` update + a negative-case test (enforced at PR review)
- **Process**: Two long-lived branches (`main` published surface, `dev` engineering); squash-merge PRs; semantic-release driven by Conventional Commits; `.planning/` filtered out of PR branches by maintainer tooling
- **Licensing**: MIT; license header in new files under `packages/`
- **Style**: No emoji in code or commit messages (OK in README headings)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v0.1.0 = Mode A only, deeply correct (Mode B → v0.2) | Mode B validation needs real iOS hardware; Mode A needs downstream soak. Depth over breadth matches Core Value. | — Pending |
| transferStore v1 = in-memory + Vercel KV (Upstash deferred) | In-memory required for test bench; Vercel KV required for cross-invocation state on Vercel; two concrete impls already prove the pluggable interface. | — Pending |
| Multi-tenant reference is the v0.1.0 gate (minimal deferred) | It's the deterministic consumer exercising the real Vercel-preview roundtrip in the realistic enterprise-B2B shape; minimal need served by README + recipe. | — Pending |
| IdP scope = Entra (concrete) + generic OIDC (CI) | Defensible provider-agnostic claim with concrete evidence; catches accidental Entra-specific coupling without exploding the test matrix. | — Pending |
| Foundation-first / Horizontal Layers, 6 phases | transferStore interface is the highest-leverage decision; design it once against two real adapters. Security tests colocated to the layer that produces them, not deferred. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-04 after initialization*
