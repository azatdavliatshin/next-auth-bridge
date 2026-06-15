# Phase 5: Multi-Tenant Reference Example - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 5-multi-tenant-reference-example
**Areas discussed:** Multi-tenancy model, Entra + secrets/deploy, Generic-OIDC CI proof, PWA scaffold + UX scope

---

## Multi-tenancy model

### Tenant routing
| Option | Description | Selected |
|--------|-------------|----------|
| Path-based `/t/[tenant]` | Tenants under a dynamic segment on one origin; simplest single-preview deploy, clean per-tenant manifest route. | ✓ |
| Subdomain-based | acme.* vs globex.*; realistic but needs wildcard DNS / multiple aliases, harder CHIPS keying. | |
| Single origin + tenant switcher | One app, config-swap selector; lightest but weaker multi-tenant proof. | |

**User's choice:** Path-based `/t/[tenant]`

### Iframe-embed demonstration
| Option | Description | Selected |
|--------|-------------|----------|
| Self-hosted host-shell page | A route in the same app iframes the tenant app, simulating the enterprise host. Self-contained, deployable, CI-testable. | ✓ |
| Real enterprise host | Embed in actual SharePoint/Teams; highest fidelity, not reproducible/CI-able. | |
| Both: self-hosted + documented manual | Self-hosted demo + manual real-host procedure. | |

**User's choice:** Self-hosted host-shell page
**Notes:** Real-host validation kept as a deferred manual procedure, not the core demo.

---

## Entra + secrets/deploy

### Entra registration shape
| Option | Description | Selected |
|--------|-------------|----------|
| One multi-tenant app (common endpoint) | Single registration, `/common` endpoint, tenant from `tid` claim; matches enterprise-B2B shape. | ✓ |
| Per-tenant registrations | Separate single-tenant app per tenant; more secrets/config, ISV-per-customer shape. | |
| You decide | Defer to planner/researcher. | |

**User's choice:** One multi-tenant app (common endpoint)

### Secrets & deploy handling (public repo)
| Option | Description | Selected |
|--------|-------------|----------|
| Vercel env vars + .env.example | Real secrets only in Vercel + GitHub Actions secrets; committed `.env.example` placeholders. | ✓ |
| Vercel + secrets in CI only | Live deploy via Vercel GitHub integration; CI holds no Entra secrets. | |
| Mock/placeholder, manual live deploy | Repo/CI placeholders; live deploy is manual out-of-band. | |

**User's choice:** Vercel env vars + .env.example

---

## Generic-OIDC CI proof

### Provider choice
| Option | Description | Selected |
|--------|-------------|----------|
| Dockerized Keycloak service container | Pre-seeded realm; real OIDC discovery + PKCE; best at catching Entra coupling. | ✓ |
| Auth.js test/credentials provider | No external service, fast/stable; lower fidelity (no real discovery/PKCE). | |
| Mocked OIDC endpoint | In-process fake OIDC; fast, mid fidelity. | |

**User's choice:** Dockerized Keycloak service container

### CI test scope
| Option | Description | Selected |
|--------|-------------|----------|
| Bridge mechanics against real Keycloak session | Programmatic Keycloak login → bridge→consume→partitioned-cookie roundtrip; no full browser. | ✓ |
| Full browser E2E (Playwright) | Entire popup roundtrip headless; highest realism, most flake-prone/slow. | |
| You decide | Defer to researcher/planner. | |

**User's choice:** Bridge mechanics against real Keycloak session

---

## PWA scaffold + UX scope

### PWA scaffold shape
| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic manifest route + labeled install page | Per-request `application/manifest+json` per tenant + labeled inert `/install-pwa`; no SW/auth. | ✓ |
| Manifest route only, minimal page | Just the route + bare note; thin entry point. | |
| Scaffold + inert service worker | Adds a no-op SW; closer to real PWA but blurs "inert". | |

**User's choice:** Dynamic manifest route + labeled install page

### UX polish
| Option | Description | Selected |
|--------|-------------|----------|
| Clean, minimal, self-documenting | Presentable, visible roundtrip state, inline explanatory copy; no design system. | ✓ |
| Bare functional | Just enough to trigger/observe; unstyled. | |
| Polished with a UI-SPEC | Run /gsd-ui-phase 5, branded experience; more scope. | |

**User's choice:** Clean, minimal, self-documenting
**Notes:** A dedicated UI-phase / design contract was offered and declined — this is a mechanics proof.

---

## Claude's Discretion

- Exact `examples/` app name/slug and internal file layout.
- Auth.js (NextAuth v5) config shape; Entra provider wiring; the programmatic Keycloak-login mechanism.
- Concrete KV provider behind `./store/kv` (Vercel KV vs Upstash Redis REST) for the live preview.
- Demo tenant set (names/count), minimum two.

## Deferred Ideas

- Real enterprise-host (SharePoint/Teams) validation as a documented manual procedure — not the core demo.
- Inert service worker in the PWA scaffold — left out to keep EXAMPLE-04 unambiguously inert.
- Polished/branded UI with a UI-SPEC — declined; clean-minimal stands.
- `next-auth-bridge/react` subpath shipping a ready-made `/auth/popup` — forward-compat from D-13, not v0.1.
- Minimal popup-only example (EXAMPLE-05) and Upstash adapter — already roadmap-deferred.
