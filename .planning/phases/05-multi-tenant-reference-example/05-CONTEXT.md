# Phase 5: Multi-Tenant Reference Example - Context

**Gathered:** 2026-06-09
**Revised:** 2026-06-09 — review addendum: added D-09 (cross-site host↔iframe is mandatory — a same-origin host-shell does NOT exercise CHIPS and makes the release gate hollow), D-10 (the opener-drives-consume transport fetch-vs-navigation is resolved HERE via a browser check), plus a D-05/D-06 PKCE-vs-programmatic-login caveat and an `examples/`-discreet mandate. These close gaps that would let the demo pass green without actually proving Mode A.
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the first **deployable** consumer of `next-auth-bridge`: a Next.js App Router
reference example that proves the Mode A popup-bridge end-to-end across multiple tenants, live on a
Vercel preview against a real Microsoft Entra registration (Vercel KV adapter), with a generic-OIDC
CI proof of provider-agnosticism and inert, labeled "Mode B preview" PWA scaffolding.

Scope is fixed by ROADMAP Phase 5 (EXAMPLE-01..04). This is a **mechanics proof that doubles as
documentation** — not a product. It is the v0.1.0 release gate (the "deterministic consumer"). The
package itself is unchanged here except for the React `/auth/popup` page that D-13 deferred to this
app; core stays React-free.

**In scope:**
- Multi-tenant App Router example app under `examples/` demonstrating the popup roundtrip across
  more than one tenant (EXAMPLE-01).
- Live Vercel preview deploy against one real multi-tenant Entra app registration, using the
  `next-auth-bridge/store/kv` adapter (EXAMPLE-02).
- CI proof of provider-agnosticism against a generic OIDC provider (Keycloak), separate from the
  live Entra preview (EXAMPLE-03).
- Per-tenant dynamic PWA manifest route + labeled inert `/install-pwa` "Mode B preview" page
  (EXAMPLE-04).
- The real `/auth/popup` React page component wrapping `runPopupFlow(deps)` (D-13 deferred deliverable).

**Out of scope (other phases / v0.2):**
- Any Mode B / PWA-shell **auth flow** — the manifest/install-pwa is inert scaffolding only (EXAMPLE-04).
- Release engineering (semantic-release, npm publish, branch protection, Auth.js docs recipe) — Phase 6.
- The minimal popup-only example app (EXAMPLE-05) — deferred to v0.1.x.
- Upstash adapter — deferred; pluggability already proven by in-memory + Vercel KV.
- A design system / branded UI — explicitly out (see D-13 below; UX is clean-minimal).

</domain>

<decisions>
## Implementation Decisions

### Multi-tenancy model
- **D-01:** **Path-based `/t/[tenant]`** on a single origin (e.g. `/t/acme`, `/t/globex`). One Vercel
  preview URL serves all tenants; the dynamic segment drives per-tenant config, the per-tenant
  manifest route, and the roundtrip demo. (Rejected subdomain-based: needs wildcard DNS / multiple
  preview aliases and complicates CHIPS partition keying across true cross-site origins. Rejected
  single-origin tenant-switcher: demonstrates multi-tenancy as config, not as distinct routable
  surfaces — weaker proof of "across more than one tenant".)
- **D-02:** The iframe-embed context (the actual scenario the bridge exists for) is demonstrated by a
  **self-hosted host-shell page** in the same example app (e.g. `/host` or an embed-demo route) that
  iframes the tenant app, simulating the enterprise host. Self-contained, deployable on one Vercel
  preview, and deterministic for the roundtrip demo. (Rejected real SharePoint/Teams host as the
  *core* demo: not reproducible on a public preview, can't run in CI. A real-host check is a
  documented manual validation at most — see Deferred.)

### Entra + secrets / deploy
- **D-03:** **One multi-tenant Entra app registration** authenticating via the **`/common` (or
  `/organizations`) endpoint**; tenant identity comes from the token's **`tid` claim**. Matches the
  real enterprise-B2B shape, one set of secrets, and the `/t/[tenant]` paths map to tenants the same
  app serves. (Rejected per-tenant single-tenant registrations: more secrets/config, models an
  ISV-per-customer shape that's heavier for a reference example.)

> **D-02 is amended by D-09 (review addendum):** the host-shell must be served from a **separate site** from the embedded tenant app (two `*.vercel.app` deployments — cross-site via the Public Suffix List), NOT a same-origin route in the same app. A same-origin iframe is first-party and does not exercise CHIPS, defeating the demo's purpose. Read D-09 before implementing the host-shell.
- **D-04:** **Secrets live ONLY in Vercel project env vars** (and **GitHub Actions secrets** for CI);
  the repo ships a committed **`.env.example`** documenting required vars with placeholder values.
  Nothing real is committed — safe for a public repo. (Required vars at minimum: Entra client ID /
  client secret / tenant config, `AUTH_SECRET`, KV connection creds, the bridge's allowed origins.)

### Generic-OIDC CI proof (provider-agnosticism)
- **D-05:** CI uses a **dockerized Keycloak service container** with a pre-seeded realm as the second,
  generic OIDC provider — exercising real OIDC discovery + PKCE to catch accidental Entra-specific
  coupling. (Per ROADMAP's Keycloak mention. Rejected Auth.js test/credentials provider: no real
  discovery/PKCE, lower fidelity. Rejected mocked OIDC endpoint: hand-rolled IdP, mid fidelity.)
- **D-06:** The Keycloak CI test exercises **bridge mechanics against a real Keycloak Auth.js
  session**: CI establishes a session via Keycloak (programmatic login), then drives the
  **bridge → consume → partitioned-cookie roundtrip**, asserting the handle exchange works with a
  non-Entra session. NOT a full headless-browser popup E2E (Playwright) — that is the most flake-prone
  surface and heavier than the agnosticism claim needs.

### PWA scaffold + UX scope
- **D-07:** EXAMPLE-04 ships a **dynamic per-tenant manifest route** (e.g.
  `/t/[tenant]/manifest.webmanifest` or a route handler) returning per-request
  `application/manifest+json` with per-tenant `name`/`icons`/`start_url`, plus a **`/install-pwa`
  landing page** that links it and is **clearly labeled "Mode B preview — not wired"**. **No service
  worker, no Mode B auth flow.** (Rejected manifest-only minimal page: thin install-pwa entry point.
  Rejected inert service worker: blurs the "inert" boundary and creeps toward Mode B territory.)
- **D-08:** UX is **clean, minimal, self-documenting**: clear page structure; visible roundtrip state
  (signed-in/out, which tenant, handle-exchange status); inline explanatory copy so the demo teaches
  the flow. **No design system, minimal/no CSS framework.** (Rejected bare-functional: weak as a
  showcase/recipe companion. Rejected polished-with-UI-SPEC: meaningfully more scope for what is
  fundamentally a mechanics proof. A separate `/gsd-ui-phase 5` was offered and declined.)

### Carried forward from prior phases (locked — do not re-litigate)
- **D-13 (Phase 3):** This example app authors the **real `/auth/popup` React component** wrapping the
  framework-agnostic `runPopupFlow(deps)`. The core package (`packages/core`) stays **React-free**;
  React lives only in this `examples/` app. This is the intended home of the `popup-page.tsx` pointer.
  Forward-compat: a ready-made page could later ship via an isolated `next-auth-bridge/react` subpath
  with React as an optional peer — not v0.1.
- **KV mandatory on Vercel:** an in-memory store fails the roundtrip by construction on serverless
  (invocations don't share memory). The production path is the `next-auth-bridge/store/kv` subpath
  export (Vercel KV / Upstash-compatible Redis).
- **`detectContext` open-union:** returns `'iframe' | 'browser' | 'pwa-shell'`; callsites use
  default-fallback (not exhaustive switch) so v0.2 wires Mode B without changing the public type.
  The example's host-shell/iframe pages exercise the `'iframe'` and `'browser'` paths.

### Review Addendum — make the demo actually prove Mode A (do not re-litigate D-01..D-08)

- **D-09 (cross-site host↔iframe is MANDATORY — a same-origin host-shell proves nothing):** The whole premise of Mode A is an app embedded as an iframe in a **cross-site** host where third-party cookies are blocked, so the popup + a CHIPS-**partitioned** cookie are required. If the host-shell (D-02) and the embedded tenant app share an origin, the iframe is **first-party → ordinary cookies work → the bridge is unnecessary**, so the demo goes green even with a broken bridge and **cannot observe CHIPS partition enforcement** — which directly contradicts the canonical-refs goal ("the real-browser context where THREAT-06's CHIPS partition enforcement can finally be observed live"). Because the example **is the v0.1.0 release gate**, a same-origin demo makes that gate **hollow**. Resolution: the host-shell MUST be served from a **separate site** from the embedded tenant app. On Vercel this is free — `vercel.app` is on the **Public Suffix List**, so two deployments (`<host-shell>.vercel.app` embedding `<tenant-app>.vercel.app`) are **genuinely cross-site** and exercise real CHIPS. D-01's path-based **tenant** routing (`/t/[tenant]`) is unaffected — tenancy is a separate axis from the host↔iframe cross-site relationship; keep path-based tenants, but the **host-shell origin ≠ app origin**. (If a single-origin demo is kept for any reason, the CHIPS/partition claim must be explicitly downgraded to "API-wiring demo, not cross-site proof" — but that forfeits the phase's stated purpose, so the two-origin setup is strongly preferred.)
- **D-10 (the consume transport — fetch vs navigation — is resolved HERE, gated on D-09):** This example authors the **real opener-drives-consume** code (the opener iframe invokes `/auth/consume`), which is exactly where the fetch-vs-navigation choice lives — a decision Phase 4 left **unresolved** (see Phase 4 D-09: an empirical CHIPS question; Phase 3's "prefer fetch" is the standing hypothesis, NOT a settled fact; Phase 4's "navigation required" framing was superseded). Phase 5 MUST: (1) implement the opener consume invocation behind a single seam so fetch-or-navigation is swappable; (2) run the **Phase 5 browser check on the live (cross-site, per D-09) Vercel preview** — have the opener issue `fetch('/auth/consume?code=...', { credentials:'include', redirect:'follow' })` and confirm whether the partitioned session cookie is committed to the iframe partition on a subsequent request; (3) **pick the transport from that observed result** (fetch if it commits — Phase 3's preference; otherwise a top-level navigation) and record it. **The check is only meaningful because D-09 makes the demo genuinely cross-site** — a same-origin demo would make fetch trivially "work" and mask the real behavior. Do not hard-code "navigation" or "fetch" before the browser check runs.
- **D-05/D-06 caveat (real PKCE vs programmatic login — for the researcher):** D-05 justifies Keycloak by **real OIDC discovery + real PKCE** (and that real-PKCE flow is what validates THREAT-05 against a second real provider). But D-06's "**programmatic login, NOT a full browser**" is in tension: a real **auth-code + PKCE** flow needs a browser-like agent. If "programmatic" resolves to Keycloak **direct-access-grant** (resource-owner-password), it **bypasses auth-code+PKCE entirely** and the real-PKCE value of D-05 silently evaporates. The researcher MUST resolve this explicitly: either drive the auth-code+PKCE step with a lightweight headless agent (preserves PKCE, keeps D-06's "no full popup E2E" spirit), or knowingly accept that the CI proves "bridge works with a Keycloak session" without exercising real PKCE — and then stop citing real PKCE as the rationale.
- **Discreet mandate extends to `examples/`:** the example app and its CI **ship in the OSS repo**, so the same shipped-source discipline as `packages/` applies — **self-contained comments, NO internal requirement IDs (`D-NN`, `THREAT-NN`, `CLIENT-NN`, `EXAMPLE-NN`, `HARDEN-NN`) in any committed example/CI source or comment**; explanatory copy in the demo explains the flow on its own terms. (THREAT-NN may appear only where the example legitimately references `docs/threat-model.md` as published documentation.)

### Claude's Discretion
- Exact `examples/` app name/slug and internal file layout (planner/researcher pick; pnpm workspace
  already globs `examples/*`).
- Auth.js (NextAuth v5 / `@auth/*`) config shape, the Entra provider wiring, and the precise
  programmatic-login mechanism for the Keycloak CI session.
- KV provider concrete choice behind the `./store/kv` adapter (Vercel KV vs Upstash Redis REST) for
  the live preview — whichever is simplest to provision; the adapter interface is already proven.
- Demo tenant set (names/count) — at least two to satisfy "across more than one tenant".

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning artifacts
- `.planning/ROADMAP.md` §"Phase 5: Multi-Tenant Reference Example" — phase goal + 4 success criteria.
- `.planning/REQUIREMENTS.md` — EXAMPLE-01..04 acceptance text (esp. EXAMPLE-04's per-request
  `application/manifest+json` constraint and EXAMPLE-03's Keycloak/Auth.js-test-provider note).
- `.planning/PROJECT.md` §"Key Decisions" — the three pending Phase-5 decision rows (transferStore
  v1 = in-memory + Vercel KV; multi-tenant reference is the v0.1.0 gate; IdP scope = Entra + generic OIDC).
- `.planning/phases/03-client-helpers-pages-middleware/03-CONTEXT.md` — D-13 (popup page deferred to
  this example), the client-helper DI seam, and the public client surface this app consumes.

### Security invariants (must not regress)
- `docs/threat-model.md` — the canonical THREAT-NN invariant registry (Phase 4). The live roundtrip
  must uphold these; the example is the real-browser context where THREAT-06's CHIPS partition
  enforcement (documented as a manual/browser check, the D-11 honesty boundary) can finally be
  observed live on Vercel.
- `CLAUDE.md` §"Threat model discipline" — any change touching bridge/consume/cookie/detection
  requires a threat-model.md update + negative test. (The example consumes these routes; if it
  surfaces a wrapper-detection or cookie change, the discipline applies.)

### Package surface the example consumes
- `packages/core/src/index.ts` — public exports: `createAuthBridge`, `runPopupFlow`, `openAuthPopup`,
  `detectContext`, `createBridgeMiddleware`, `getAuthCookieName`, `sanitizeNext`, types.
- `packages/core/package.json` §`exports` — main entry + `./store/kv` subpath (the KV adapter the
  live preview uses).
- `pnpm-workspace.yaml` — already globs `examples/*`; the example app slots in as a workspace package.

### External docs (fetch current versions during research — none committed in-repo)
- Auth.js / NextAuth v5 Microsoft Entra ID provider docs (multi-tenant `/common`, `tid` claim).
- Auth.js Keycloak provider docs + Keycloak server container / realm-import for CI.
- Vercel KV (or Upstash Redis) setup + Vercel preview env var configuration.
- Web App Manifest spec (`application/manifest+json`, per-tenant `start_url`/`scope`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createAuthBridge(options)` → `{ bridge, consume }` — the single server wiring point the example's
  `/auth/bridge` + `/auth/consume` route handlers mount.
- `runPopupFlow(deps)` — wrapped by the new `/auth/popup` React page (D-13).
- `openAuthPopup(...)` — the opener-side helper the embedded iframe app calls to open the popup and
  receive the `{ code }` (THREAT-03 origin/source checks built in).
- `createBridgeMiddleware(...)` — wrapper/iframe detection + redirect routing for the example's middleware.
- `detectContext` / `BridgeContext` — drives the host-shell vs in-iframe vs browser rendering.
- `next-auth-bridge/store/kv` — the production transfer store for the Vercel deploy.
- `sanitizeNext`, `getAuthCookieName` — redirect hygiene + cookie-name resolution the example reuses.

### Established Patterns
- **Factory functions, no classes** (project-wide) — any example-local helpers follow closures-over-deps.
- **DI seam for testability** — the client helpers take browser deps via params; the example provides
  the *real* browser implementations (real `window`, real `fetch`, real `open`).
- **Vitest with explicit negative cases** — CI tests (incl. the Keycloak roundtrip) carry negative
  coverage in the project style; threat-model invariants stay green.
- **Subpath isolation** (`./store/kv`) — the pattern for keeping optional/heavy deps out of the core
  surface; mirrors the future `next-auth-bridge/react` idea.

### Integration Points
- `examples/<app>/` — NEW workspace package (first occupant of the `examples/*` glob; `examples/`
  dir does not yet exist).
- The example imports `next-auth-bridge` (main) + `next-auth-bridge/store/kv` (subpath) as a workspace dep.
- GitHub Actions — NEW CI job adding the dockerized Keycloak service container + the bridge roundtrip
  test (separate from any Entra-dependent step, which stays on the Vercel preview, not in CI).
- Vercel project — NEW deploy target; env vars + the `.env.example` contract.

</code_context>

<specifics>
## Specific Ideas

- The host-shell page should make the cross-context handoff *legible*: show the iframe, the popup
  opening top-level, and the resulting partitioned cookie / signed-in state in the iframe — so the
  demo visibly teaches why the bridge exists (D-02 + D-08).
- At least two demo tenants under `/t/[tenant]` so "across more than one tenant" is concretely shown,
  each with its own manifest `name`/`icons` (D-01 + D-07).
- The `/install-pwa` page's "Mode B preview — not wired" label should be unambiguous so no reader
  mistakes the inert scaffold for a working native flow (D-07 + EXAMPLE-04).

</specifics>

<deferred>
## Deferred Ideas

- **Real enterprise-host validation (SharePoint / Teams Tab):** a documented manual procedure to
  verify the roundtrip inside a real host — not the example's core demo (not CI-reproducible). Best as
  a Phase 6 validation note or post-publish soak item. (Raised under D-02.)
- **Inert service worker in the PWA scaffold:** would make the install experience more real but blurs
  the EXAMPLE-04 "inert" boundary and drifts toward Mode B — explicitly left out (D-07).
- **Polished/branded UI with a UI-SPEC (`/gsd-ui-phase 5`):** offered and declined; UX stays
  clean-minimal (D-08). Could be revisited if the example becomes a marketing surface.
- **`next-auth-bridge/react` subpath shipping a ready-made `/auth/popup`:** forward-compat hook from
  D-13; additive, optional React peer — not v0.1.
- **Minimal popup-only example (EXAMPLE-05) and Upstash adapter:** already roadmap-deferred to v0.1.x/v0.2.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo.match-phase 05` returned zero matches).

</deferred>

---

*Phase: 5-multi-tenant-reference-example*
*Context gathered: 2026-06-09*
