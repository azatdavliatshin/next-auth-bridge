# Phase 5: Multi-Tenant Reference Example - Research

**Researched:** 2026-06-09
**Domain:** Next.js App Router + Auth.js v5 reference example; Vercel preview deploy (Upstash Redis KV); cross-site CHIPS partitioned cookies; dockerized Keycloak CI; dynamic PWA manifest
**Confidence:** HIGH on stack/architecture/CHIPS-transport; MEDIUM on Keycloak-CI mechanics; LOW on a few live-observation steps that are inherently manual (flagged)

## Summary

Phase 5 builds `examples/<app>/` — the first deployable consumer of `next-auth-bridge` and the v0.1.0 release gate. It is a Next.js App Router app wired with Auth.js v5 (`next-auth@beta`, currently `5.0.0-beta.31`) using the `MicrosoftEntraID` provider on the multi-tenant `/common` (or `/organizations`) endpoint, deployed to a Vercel preview backed by Upstash Redis (the artifact formerly called "Vercel KV") through the package's `next-auth-bridge/store/kv` subpath. The example authors the real `/auth/popup` React page (the D-13 deferred deliverable) wrapping `runPopupFlow(deps)`, and exercises the full Mode A popup roundtrip across at least two path-based tenants (`/t/[tenant]`). A second CI-only job runs a dockerized Keycloak as a generic-OIDC provider to prove provider-agnosticism. A dynamic per-tenant manifest route plus an inert, clearly-labeled `/install-pwa` "Mode B preview" page round out the scaffolding.

Two review-addendum decisions (D-09, D-10) make this gate meaningful rather than hollow: the host-shell that iframes the tenant app MUST be a **separate `*.vercel.app` origin** (because `vercel.app` is on the Public Suffix List, two deployments are genuinely cross-site and exercise real CHIPS) — `[VERIFIED: privacysandbox.google.com + Vercel KB]`; and the fetch-vs-navigation consume-transport question is resolved HERE via a live browser check behind a swappable seam. **Research resolves the empirical CHIPS question in favor of fetch:** the partition key of a `Partitioned` cookie is "the site of the top-level URL the browser was visiting at the start of the request," and a `Set-Cookie` carried on a redirect or a `fetch()` issued from inside a cross-site iframe is committed to the **embedding top-level site's partition** regardless of transport `[CITED: privacysandbox.google.com/3pcd/chips]`. This is a strong reason to prefer fetch — but D-10 mandates the live observation still be run and recorded; the seam stays swappable until it is.

**Primary recommendation:** Build one App Router example app (the tenant app) deployed to `<app>.vercel.app`, plus a minimal separate host-shell deployed to `<host>.vercel.app` that cross-site-iframes it. Use `next-auth@beta` + `MicrosoftEntraID` (`/common`) + the `./store/kv` subpath (Upstash Redis via `Redis.fromEnv()`). For the Keycloak CI proof, drive a **real auth-code + PKCE** flow with a browserless curl/fetch script that parses Keycloak's login form and POSTs credentials (preserves the D-05 real-PKCE rationale; honors D-06's "no full popup E2E / no Playwright" spirit) — do NOT use direct-access-grant, which would silently bypass PKCE. Keep the live cross-site CHIPS partition observation as a documented **manual browser DevTools procedure** (the THREAT-06 / D-11 honesty boundary).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entra/Keycloak OIDC sign-in (`auth()`, providers) | API / Backend (Auth.js route handlers + server `auth()`) | Frontend Server (SSR session read) | Auth.js owns the OIDC dance; session verified server-side, never in browser |
| `/auth/bridge` mint (session-gated handle) | API / Backend | — | `verifySession` is the real gate; runs server-side only (ROUTE-01/THREAT-04) |
| `/auth/consume` (set partitioned cookie) | API / Backend | — | Cookie attributes + handle exchange are server-issued (ROUTE-03/THREAT-06) |
| `/auth/popup` page (silent-auth, postMessage) | Browser / Client | Frontend Server (renders the page) | Runs in the top-level popup context; D-13 React component lives here |
| `openAuthPopup` opener + opener-drives-consume | Browser / Client | — | Opener (embedded iframe app) opens popup, receives `{code}`, drives consume so cookie lands in iframe partition (D-01/D-10) |
| `detectContext` (iframe vs browser routing) | Browser / Client | Frontend Server (middleware mirror) | Client classifies for UX; middleware does its own server-side `Sec-Fetch-Dest` inference |
| `createBridgeMiddleware` context routing | Frontend Server (Edge runtime) | — | Edge middleware; store-free/crypto-free import graph (D-16) |
| Transfer store (one-time handle) | Database / Storage (Upstash Redis) | — | In-memory fails on serverless by construction; KV mandatory (STORE-03) |
| Per-tenant manifest route | API / Backend (route handler) | CDN/Static (icons) | Per-request `application/manifest+json`; `force-dynamic` to defeat caching |
| Host-shell (cross-site iframe host) | Frontend Server (separate origin) | — | Simulates the enterprise host; MUST be a distinct `*.vercel.app` site (D-09) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.2.7` (latest) — pin a current major | App Router host framework | The package targets Next.js; reference example must be a real Next app `[VERIFIED: npm registry]` |
| `next-auth` | `5.0.0-beta.31` (the `beta` dist-tag = Auth.js v5) | OIDC auth, `auth()`, route handlers, Entra + Keycloak providers | Auth.js is the package's peer ecosystem; the core was built against v5's `auth()` shape `[VERIFIED: npm registry — beta tag]` |
| `react` / `react-dom` | `19.2.7` | The `/auth/popup` and host-shell/UI pages (D-13) | Required by Next App Router; React lives ONLY in this example, not in `packages/core` `[VERIFIED: npm registry]` |
| `next-auth-bridge` | workspace `0.1.0` (main) | bridge/consume/client helpers/middleware | The package under test — consumed as a workspace dep `[VERIFIED: codebase]` |
| `next-auth-bridge/store/kv` | workspace subpath | Production transfer store on Upstash Redis | Mandatory on serverless; `Redis.fromEnv()` reads the Upstash env vars `[VERIFIED: codebase packages/core/src/transfer-store/kv.ts]` |
| `@upstash/redis` | `1.38.0` | KV client behind `./store/kv` (optional peer dep, already declared) | The non-deprecated client the KV adapter is built on `[VERIFIED: npm registry + codebase package.json]` |

> **Auth.js version trap (HIGH importance):** `npm view next-auth version` returns `4.24.14` (the `latest` tag). **Auth.js v5 is published under the `beta` tag** (`5.0.0-beta.31`). The example MUST install `next-auth@beta` (or pin `5.0.0-beta.x`). v4 has a different config shape (`[...nextauth]` API route, `getServerSession`) and would NOT match the `auth()`-style `verifySession` the core was built against. `[VERIFIED: npm registry dist-tags]`

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | `^5` | strict types (project convention) | Always — `strict: true`, no `any` outside test scaffolding |
| `vitest` | `^4.1.8` | The Keycloak CI roundtrip test harness | The provider-agnosticism CI assertion (EXAMPLE-03) — matches project test framework |
| (CI only) Keycloak container | `quay.io/keycloak/keycloak:26.x` | Generic-OIDC provider in GitHub Actions | EXAMPLE-03 — pre-seeded realm via `--import-realm` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Upstash Redis (marketplace) | Standalone Upstash account creds | Same `@upstash/redis` client + same env vars; marketplace integration auto-injects creds into Vercel. Use whichever provisions fastest (D — discretion) |
| browserless curl/fetch PKCE script (Keycloak CI) | Playwright headless browser | Playwright is heavier + the most flake-prone surface; D-06 explicitly rejects full headless-browser popup E2E. Curl-script preserves real PKCE without a browser (see D-05/D-06 resolution) |
| browserless curl/fetch PKCE script | Keycloak direct-access-grant (ROPC) | ROPC bypasses auth-code+PKCE entirely → silently voids D-05's real-PKCE rationale. **Rejected** — see resolution below |
| path-based tenants `/t/[tenant]` (D-01, locked) | subdomain tenants | Subdomains need wildcard DNS / multiple preview aliases and tangle with CHIPS partition keying — locked against |

**Installation (example app — exact pins set by planner):**
```bash
# in examples/<app>/
pnpm add next@16 react@19 react-dom@19 next-auth@beta
pnpm add next-auth-bridge@workspace:*           # main + ./store/kv subpath
pnpm add @upstash/redis@^1.38.0                 # KV client (peer of the subpath)
```

**Version verification (run during planning to confirm currency):**
```bash
npm view next version           # 16.2.7 at research time
npm view next-auth@beta version # 5.0.0-beta.31 at research time
npm view @upstash/redis version # 1.38.0
npm view react version          # 19.2.7
```

## Package Legitimacy Audit

slopcheck `0.6.1` ran clean against all phase packages on the npm registry (no `--json` flag in this version; text output parsed).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `next` | npm | mature (years) | very high | github.com/vercel/next.js | [OK] | Approved |
| `next-auth` (`@beta`) | npm | mature | high | github.com/nextauthjs/next-auth | [OK] | Approved (install `@beta` for v5) |
| `react` | npm | mature | very high | github.com/facebook/react | [OK] | Approved |
| `react-dom` | npm | mature | very high | github.com/facebook/react | [OK] | Approved |
| `@upstash/redis` | npm | mature | high | github.com/upstash/redis-js | [OK] | Approved (already a declared optional peer) |
| `@auth/core` | npm | mature | high | github.com/nextauthjs/next-auth | [OK] | Approved (transitive of `next-auth`; not a direct dep) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │  HOST-SHELL ORIGIN   <host>.vercel.app        │  ← SEPARATE SITE (D-09)
                         │  (simulated enterprise host)                  │     vercel.app is on the PSL
                         │                                               │     → genuinely cross-site
                         │   ┌──────── <iframe src=app-origin> ───────┐  │
                         │   │  TENANT APP  <app>.vercel.app/t/acme    │  │
   user ───nav──────────┼──▶│  (embedded, cross-site = 3p context)    │  │
                         │   │   detectContext() → 'iframe'            │  │
                         │   │   unauth → middleware rewrite           │  │
                         │   │            → popup-entry page           │  │
                         │   │   click "Sign in" → openAuthPopup()─────┼──┼──┐
                         │   └─────────────────────────────────────────┘  │  │ window.open (top-level)
                         └─────────────────────────────────────────────┘  │  ▼
                                                                  ┌────────────────────────────────┐
                                                                  │ POPUP (top-level browser ctx)  │
                                                                  │ <app>.vercel.app/auth/popup    │
                                                                  │ has the Entra/IdP session      │
                                                                  │ runPopupFlow(deps):            │
                                                                  │   fetch /auth/bridge ──────────┼──┐
                                                                  └────────────────────────────────┘  │
                                                                                                       ▼
   ┌─────────────────────── TENANT APP SERVER (Vercel serverless, App Router) ───────────────────────────┐
   │  /api/auth/*  (Auth.js v5 — MicrosoftEntraID /common, tid claim → tenant)                            │
   │  /auth/bridge  → verifySession (auth()) gate → store.create(payload) → 200 { code }   (zero cookies) │
   │  /auth/consume → store.consume(code) [atomic getdel] → 302 + Partitioned Set-Cookie per chunk        │
   │            store = createKVTransferStore()  ──────────────►  Upstash Redis (KV_REST_API_* env)       │
   └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                                          ▲
        │ popup postMessage({code}) to opener (iframe)            │ opener fetch('/auth/consume?code=',{credentials:'include'})
        └── opener (embedded iframe) receives code ───────────────┘   → Partitioned cookie commits to <host> partition
                                                                       (verified-by-research: partition key = top-level site)
```

### Recommended Project Structure
```
examples/
  <tenant-app>/                       # the embedded multi-tenant app (deployed to <app>.vercel.app)
    app/
      t/[tenant]/page.tsx             # per-tenant landing (signed-in/out, handle-exchange state) — D-08
      t/[tenant]/manifest.webmanifest/route.ts  # dynamic per-tenant manifest (EXAMPLE-04, force-dynamic)
      install-pwa/page.tsx            # inert "Mode B preview — not wired" page (EXAMPLE-04)
      auth/popup/page.tsx             # the D-13 React page wrapping runPopupFlow(deps)
      api/auth/[...nextauth]/route.ts # Auth.js v5 handlers (handlers.GET/POST)
      auth/bridge/route.ts            # mounts createAuthBridge().bridge
      auth/consume/route.ts           # mounts createAuthBridge().consume
    middleware.ts                     # createBridgeMiddleware(...) → NextResponse.rewrite/next
    auth.ts                           # NextAuth({ providers: [MicrosoftEntraID(...)] })
    lib/consume-transport.ts          # THE SWAPPABLE SEAM (D-10): fetch | navigation
    .env.example                      # documented placeholders only (D-04)
  <host-shell>/                       # SEPARATE deploy target (deployed to <host>.vercel.app, D-09)
    app/page.tsx                      # iframes <app>.vercel.app/t/acme cross-site; renders the demo legibly
.github/workflows/
  keycloak-agnosticism.yml            # CI job: dockerized Keycloak + bridge roundtrip (EXAMPLE-03)
```

> Two deploy targets can be two folders under `examples/` (both globbed by `pnpm-workspace.yaml`'s `examples/*`), OR one app with two Vercel projects rooted at different directories. The host-shell can be a tiny separate app since its only job is to cross-site-iframe the tenant app. Planner picks layout (D — discretion).

### Pattern 1: Auth.js v5 Microsoft Entra multi-tenant provider
**What:** Configure the `MicrosoftEntraID` provider against the `/common` (multi-tenant + personal) or `/organizations` (multi-tenant work/school) issuer; tenant identity is read from the token's `tid` claim in a `jwt`/`session` callback.
**When to use:** The single multi-tenant Entra app registration (D-03).
```typescript
// Source: authjs.dev/getting-started/providers/microsoft-entra-id  [CITED]
// auth.ts
import NextAuth from "next-auth"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Multi-tenant + personal: /common (the default if issuer omitted).
      // Multi-tenant work/school only: /organizations.
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER, // e.g. https://login.microsoftonline.com/common/v2.0
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      // tid is the tenant id from the multi-tenant token (validate against the
      // mapped tenant for /t/[tenant]). oid+tid uniquely identify the account.
      if (profile?.tid) token.tid = profile.tid
      return token
    },
    async session({ session, token }) {
      // surface tenant id to the app so /t/[tenant] can assert it
      ;(session as any).tid = token.tid
      return session
    },
  },
})
```
> Issuer values `[CITED: authjs.dev]`: single-tenant `https://login.microsoftonline.com/<tenant-id>/v2.0`; multi-tenant work/school `.../organizations/v2.0`; multi-tenant+personal (default) `.../common/v2.0`; personal-only `.../consumers/v2.0`. The default when `issuer` is unset is `/common/v2.0` `[CITED: authjs.dev]`. The exact `tid` read path (profile vs id_token claim) is `[ASSUMED]` — confirm the claim is on `profile` at execution; if not, decode it from `account.id_token`. Microsoft Learn: for multitenant apps you must validate `iss` matches the published metadata and contains the `tid` `[CITED: learn.microsoft.com/howto-convert-app-to-be-multi-tenant]`.

### Pattern 2: The KV adapter on the Vercel preview (Upstash Redis)
**What:** Mount `createKVTransferStore()` (zero args → `Redis.fromEnv()`) as the `store` for `createAuthBridge`. `Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` || `KV_REST_API_URL` and `UPSTASH_REDIS_REST_TOKEN` || `KV_REST_API_TOKEN`.
**When to use:** Always on Vercel — in-memory fails by construction (serverless invocations do not share memory) `[VERIFIED: codebase kv.ts header + STORE-03]`.
```typescript
// Source: codebase packages/core/src/transfer-store/kv.ts  [VERIFIED]
import { createKVTransferStore } from "next-auth-bridge/store/kv"
import { createAuthBridge } from "next-auth-bridge"
import { auth } from "./auth"

const { bridge, consume } = createAuthBridge({
  store: createKVTransferStore(),                 // Redis.fromEnv() — no manual client
  verifySession: () => auth(),                    // the real gate (ROUTE-01)
  allowedOrigins: [process.env.HOST_SHELL_ORIGIN!, process.env.APP_ORIGIN!],
  secure: true,                                   // production HTTPS → __Secure- cookie name
})
```
> **Vercel KV is gone (state-of-the-art):** Vercel deprecated the first-party "Vercel KV"; existing stores were auto-migrated to **Upstash Redis** in Dec 2024, and new projects provision Redis via the **Vercel Marketplace → Upstash** integration `[CITED: vercel.com/docs/redis + community.vercel.com]`. The marketplace integration injects `KV_REST_API_URL`/`KV_REST_API_TOKEN` (and/or `UPSTASH_REDIS_REST_*`) — both are already handled by `Redis.fromEnv()` in the existing adapter `[VERIFIED: codebase kv.ts:55-60]`. **No code change to the package needed** — the adapter already supports both env-var conventions.

### Pattern 3: The opener-drives-consume swappable seam (D-10)
**What:** A single module (`lib/consume-transport.ts`) exposes one function the opener calls to redeem the handle; its internals are swappable between `fetch` and a navigation without touching callers.
**When to use:** The opener (embedded iframe app) after `openAuthPopup` resolves `{ code }`.
```typescript
// THE seam — keeps fetch-vs-navigation swappable until the live browser check
// (D-10) is recorded. Research strongly favors fetch (partition key = top-level
// site regardless of transport — CITED below); the seam stays so the observed
// result is what locks it, not this default.
export async function redeemHandle(code: string, next = "/"): Promise<void> {
  const url = `/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
  // VARIANT A (preferred): fetch from inside the iframe; the Partitioned
  // Set-Cookie on the 302 commits to the embedding top-level site's partition.
  await fetch(url, { credentials: "include", redirect: "follow" })
  // VARIANT B (fallback if the live check disproves A): top-level navigation
  //   window.location.assign(url)
}
```
> The existing `consume-route.ts` reads `code` from the **query string** (`new URL(request.url).searchParams`) `[VERIFIED: codebase consume-route.ts:114-116]`. With GET-by-query, the opaque one-time handle legitimately appears in the consume URL — this is permitted by THREAT-07/D-15 (the *token* never appears in a URL; the opaque `code` may, exactly like an OAuth auth-code) `[VERIFIED: docs/threat-model.md THREAT-07]`. If a POST-body transport is ever chosen, the route would need to also read `code` from the body — not required for v0.1.

### Pattern 4: Browserless Keycloak auth-code + PKCE in CI (D-05/D-06 resolution)
**What:** A bash/Node script that performs the real OIDC auth-code+PKCE flow against Keycloak without a browser: generate `code_verifier`/`code_challenge`, GET the authorization endpoint to obtain the login form, parse its `action` URL, POST credentials with the auth cookies, follow the redirect to capture `code`, then POST `code + code_verifier` to the token endpoint.
**When to use:** Establishing a real Keycloak Auth.js session in CI to then drive the bridge→consume roundtrip (EXAMPLE-03).
```bash
# Source pattern: thrysoee.dk/keycloak-authorization-code-login  [CITED]
# 1. PKCE pair
VERIFIER=$(openssl rand -base64 96 | tr -d '\n=+/' | cut -c1-64)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
# 2. GET /auth?...code_challenge=$CHALLENGE&code_challenge_method=S256 → parse login form action
# 3. POST username/password to the form action (carry KC cookies) → 302 with ?code=
# 4. POST grant_type=authorization_code&code=$CODE&code_verifier=$VERIFIER to /token
```
**See "D-05/D-06 Resolution" below for the full rationale.** This is the recommended path; it preserves the real-PKCE claim that justifies Keycloak (D-05) while staying browserless per D-06.

### Pattern 5: Dynamic per-tenant manifest route (EXAMPLE-04)
**What:** An App Router route handler at `app/t/[tenant]/manifest.webmanifest/route.ts` returning a per-request `application/manifest+json` body with per-tenant `name`/`icons`/`start_url`/`scope`; `export const dynamic = "force-dynamic"` defeats the default caching.
```typescript
// Source: nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
//         + route-handler caching rules  [CITED]
export const dynamic = "force-dynamic" // per-request, not cached

export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  const body = {
    name: `${tenant} — Mode B preview`,
    short_name: tenant,
    start_url: `/t/${tenant}`,
    scope: `/t/${tenant}`,
    display: "standalone",
    icons: [{ src: `/t/${tenant}/icon.png`, sizes: "512x512", type: "image/png" }],
  }
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json" },
  })
}
```
> The correct media type is `application/manifest+json` `[CITED: W3C Web App Manifest spec / MDN]`. Use a raw `Response` with the explicit `Content-Type` (NOT `NextResponse.json()`, which sets `application/json`). The `/install-pwa` page links it and is labeled **"Mode B preview — not wired"**; **no service worker, no Mode B auth** (D-07).

### Anti-Patterns to Avoid
- **Same-origin host-shell:** a host-shell that shares an origin with the tenant app is first-party → ordinary cookies work → the bridge is unnecessary → the demo goes green even with a broken bridge and **cannot observe CHIPS** (D-09). The release gate becomes hollow. The host-shell MUST be a separate `*.vercel.app` origin.
- **Keycloak direct-access-grant (ROPC) for the CI proof:** bypasses auth-code+PKCE → silently voids D-05's real-PKCE rationale. Use the browserless auth-code+PKCE script instead.
- **`NextResponse.json()` for the manifest:** emits `application/json`, not `application/manifest+json` — fails the EXAMPLE-04 media-type constraint.
- **Caching the manifest route:** without `force-dynamic` (or a request-time API), App Router caches the manifest and per-tenant content is wrong — EXAMPLE-04 requires per-request behavior.
- **Internal req-IDs in shipped example/CI source:** `D-NN`/`THREAT-NN`/`EXAMPLE-NN`/`CLIENT-NN`/`HARDEN-NN` MUST NOT appear in any committed `examples/` or `.github/` source or comment (the discreet mandate extends to `examples/`). `THREAT-NN` may appear only where the example legitimately references `docs/threat-model.md` as published docs.
- **Installing `next-auth` (the `latest`=v4 tag):** would pull v4 (`4.24.14`) with an incompatible config shape. Install `next-auth@beta`.
- **Hard-coding the in-memory store on the Vercel deploy:** fails the roundtrip by construction (no shared memory across invocations) — KV is mandatory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC sign-in / session | A custom OAuth client | Auth.js v5 `MicrosoftEntraID` / `Keycloak` providers | PKCE, discovery, token handling are all handled; the core's `verifySession` only asks "is there a session?" |
| One-time handle store | A custom Redis wrapper | `next-auth-bridge/store/kv` (`createKVTransferStore`) | Atomic `getdel` + native TTL already implemented and tested (STORE-03) |
| Popup origin/source checks | Ad-hoc `postMessage` validation | `openAuthPopup` + `isTrustedMessage` | THREAT-03 origin+source checks built in and tested |
| Cookie attribute serialization | Manual `Set-Cookie` strings | `createConsumeHandler` (in the package) | CHIPS floors (`Partitioned; Secure; HttpOnly; SameSite=None; Path=/`) already emitted per chunk |
| iframe/browser routing | Custom UA sniffing | `createBridgeMiddleware` + `detectContext` | `Sec-Fetch-Dest` server signal + `window.self !== window.top` client signal, both already shipped |
| Keycloak realm provisioning | Manual admin-console clicks in CI | `--import-realm` with a committed realm-export JSON | Deterministic, reproducible CI; documented Keycloak feature |

**Key insight:** This phase is almost entirely *integration*, not new mechanism. The single genuinely new package artifact is the `/auth/popup` React page (D-13). Everything security-critical already exists and is tested in `packages/core`; the example's job is to wire it correctly and observe the one thing the Node bench cannot — real CHIPS partition isolation in a live browser.

## Runtime State Inventory

> Greenfield-leaning phase (new `examples/` app, no rename), but it introduces live external state. Inventory of external/runtime config the plan must provision (not in git):

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Upstash Redis holds one-time handles (≤60s TTL, auto-evicted). No long-lived data, no migration. | None — handles are ephemeral by design |
| Live service config | (1) Vercel project env vars for the tenant app + host-shell (Entra creds, `AUTH_SECRET`, `KV_REST_API_*`, allowed origins). (2) Entra app registration: redirect URI `https://<app>.vercel.app/api/auth/callback/microsoft-entra-id`, multi-tenant audience. (3) Two Vercel deploy targets (app + host-shell). | Manual provisioning in Vercel + Entra portals; documented in `.env.example` (D-04) |
| OS-registered state | None. | None — no OS-level registration |
| Secrets/env vars | `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/ISSUER`, `AUTH_SECRET`, `KV_REST_API_URL/TOKEN` (or `UPSTASH_REDIS_REST_*`), allowed-origins config. GitHub Actions secrets for the Keycloak CI job (Keycloak admin creds, test user). Nothing real committed — only `.env.example` placeholders (D-04). | Provision in Vercel env + GitHub Actions secrets; commit `.env.example` only |
| Build artifacts | New workspace package(s) under `examples/*` (globbed already). `next-auth-bridge` consumed as `workspace:*`. | `pnpm install` resolves; ensure the package builds (`dist/` with `./store/kv`) before the example imports the subpath |

**Nothing found in category:** OS-registered state — None (no Task Scheduler / launchd / systemd involvement). Stored-data migration — None (handles are ephemeral, TTL ≤ 60s).

## Common Pitfalls

### Pitfall 1: Hollow gate from a same-origin host-shell
**What goes wrong:** The demo passes green but never exercises CHIPS; a broken bridge would still "work" because first-party cookies flow.
**Why it happens:** Convenience — one app, one origin, an in-app `/host` route.
**How to avoid:** Deploy the host-shell to a **separate `*.vercel.app` origin** (D-09). `vercel.app` is on the Public Suffix List so the two deployments are genuinely cross-site `[VERIFIED: Vercel KB + PSL]`.
**Warning signs:** The iframe's cookies work without `Partitioned`; DevTools shows the cookie in the default (unpartitioned) jar.

### Pitfall 2: Auth.js v4 installed instead of v5
**What goes wrong:** `next-auth` resolves to `4.24.14`; the config shape (`[...nextauth]` options object, `getServerSession`) does not match the `auth()`-based `verifySession` the core expects.
**Why it happens:** `latest` dist-tag is v4; v5 is `beta`.
**How to avoid:** Install `next-auth@beta` and pin `5.0.0-beta.x`.
**Warning signs:** `import NextAuth from "next-auth"` returns a function with a v4 signature; no `handlers`/`auth` export.

### Pitfall 3: Keycloak CI silently proves nothing about PKCE
**What goes wrong:** "Programmatic login" is implemented as direct-access-grant (ROPC), which never runs auth-code+PKCE — so the "provider-agnostic, real-PKCE" claim (D-05) is false while CI is green.
**Why it happens:** ROPC is the easiest to script (one token POST with username/password).
**How to avoid:** Drive the real auth-code+PKCE flow with the browserless curl/fetch script (Pattern 4), generating `code_verifier`/`code_challenge` and exchanging the captured `code`.
**Warning signs:** The CI script POSTs `grant_type=password`; no `code_challenge`/`code_verifier` anywhere.

### Pitfall 4: Manifest served as `application/json` or cached
**What goes wrong:** EXAMPLE-04's "valid `application/manifest+json` per request" fails — either wrong media type (`NextResponse.json()`) or stale per-tenant body (cached route).
**How to avoid:** Raw `Response` with explicit `Content-Type: application/manifest+json` + `export const dynamic = "force-dynamic"`.
**Warning signs:** DevTools Network shows `Content-Type: application/json`; two tenants return identical manifests.

### Pitfall 5: Edge-runtime middleware pulling in the store
**What goes wrong:** Importing the KV store/`@upstash/redis`/`node:crypto` into `middleware.ts` breaks the Edge runtime build.
**Why it happens:** Co-locating config; importing `createAuthBridge` (which pulls the store) into middleware.
**How to avoid:** The package already separates `createBridgeMiddleware` with a store-free import graph (D-16); in the example, wire middleware from `createBridgeMiddleware` only, never from `createAuthBridge` `[VERIFIED: codebase middleware.ts header]`.

### Pitfall 6: Cross-site cookie not committing because attributes are wrong
**What goes wrong:** The partitioned cookie is dropped because it lacks `Secure` or `SameSite=None`.
**Why it happens:** Non-HTTPS preview, or missing attributes.
**How to avoid:** Vercel previews are HTTPS; the package emits `Partitioned; Secure; HttpOnly; SameSite=None; Path=/` already. Set `secure: true` so the `__Secure-` cookie name is used `[VERIFIED: consume-route.ts + types.ts]`.
**Warning signs:** DevTools console: "This Set-Cookie was blocked because it had the Partitioned attribute but did not have Secure / SameSite=None."

## Code Examples

### Mounting the bridge + consume routes (App Router)
```typescript
// Source: codebase create-auth-bridge usage + Next App Router route handlers  [VERIFIED: codebase]
// app/auth/bridge/route.ts
import { bridge } from "@/lib/auth-bridge"   // createAuthBridge(...).bridge
export const POST = (req: Request) => bridge(req)
export const GET  = (req: Request) => bridge(req) // popup fetches GET /auth/bridge (runPopupFlow default)
```
> Note: `runPopupFlow` fetches `/auth/bridge` with a plain `fetch(bridgePath)` (GET) `[VERIFIED: popup-flow.ts:114]`. The bridge handler is a Web-standard `(request) => Promise<Response>` `[VERIFIED: codebase]` — mount it directly.

### The /auth/popup React page (D-13 — the one new package-shaped artifact)
```tsx
// Source: composition of runPopupFlow(deps) — codebase popup-flow.ts  [VERIFIED]
"use client"
import { useEffect } from "react"
import { runPopupFlow } from "next-auth-bridge"

export default function PopupPage() {
  useEffect(() => {
    // opener is the embedded iframe app; hostOrigin must be its EXACT origin (never "*").
    if (!window.opener) return
    void runPopupFlow({
      opener: window.opener as unknown as { postMessage(d: unknown, t: string): void },
      hostOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN!, // the iframe app origin
      // fetch + bridgePath default to global fetch + "/auth/bridge"
    })
  }, [])
  return <p>Completing sign-in…</p>
}
```

### Opener flow in the embedded iframe app
```tsx
// Source: codebase open-auth-popup.ts + the D-10 seam  [VERIFIED]
import { openAuthPopup } from "next-auth-bridge"
import { redeemHandle } from "@/lib/consume-transport"

async function signIn() {
  const { code } = await openAuthPopup({
    allowedOrigins: [process.env.NEXT_PUBLIC_APP_ORIGIN!],
    popupUrl: "/auth/popup",
  })
  await redeemHandle(code, location.pathname) // the swappable seam (fetch by default)
  // re-render / soft-navigate so the now-authenticated iframe reflects the session
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vercel KV (first-party) | Upstash Redis via Vercel Marketplace | Dec 2024 migration | Provision Redis through the marketplace; same `@upstash/redis` client + `Redis.fromEnv()` — no package code change `[CITED: vercel.com/docs/redis]` |
| NextAuth v4 (`[...nextauth]`, `getServerSession`) | Auth.js v5 (`auth()`, `handlers`) | v5 `beta` line | Install `next-auth@beta`; the core was built against the `auth()` shape `[VERIFIED: npm dist-tags]` |
| Third-party cookies in iframes | CHIPS `Partitioned` cookies | Chrome 3PCD rollout | The whole reason Mode A exists; partition key = top-level site `[CITED: privacysandbox.google.com]` |
| `tsup` build | `tsdown` (Rolldown successor) | Tracked for Phase 6, not this phase | No Phase 5 impact (build-time only) |

**Deprecated/outdated:**
- "Vercel KV" as a first-party product — replaced by Upstash Redis (env vars unchanged for `Redis.fromEnv()`).
- `@vercel/kv` package — superseded by `@upstash/redis` (already the package's chosen client).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `tid` claim is reachable on `profile` in the Auth.js `jwt` callback for Entra `/common` | Pattern 1 | Tenant assertion needs the claim decoded from `account.id_token` instead — small code change, confirm at execution |
| A2 | A `fetch()` from inside the iframe commits the redirect-hop `Partitioned` Set-Cookie to the embedding top-level partition in **current Chrome** (the research CITES the spec's partition-key rule; live behavior must still be observed per D-10) | Pattern 3, Validation | If Chrome's implementation diverges from spec for the fetch+redirect case, fall back to navigation (Variant B). D-10 mandates the live check precisely to resolve this |
| A3 | `next-auth@beta` (`5.0.0-beta.31`) is stable enough for a reference example | Standard Stack | Beta churn could shift the config shape; pin the exact beta version. The core already depends on the v5 shape, so this is the only viable path |
| A4 | The Vercel preview is HTTPS so `Secure`+`Partitioned` cookies commit | Pitfall 6 | Previews are HTTPS by default — low risk |
| A5 | Keycloak `26.x` `--import-realm` + the healthcheck on `:9000/health/ready` (needs `KC_HEALTH_ENABLED=true`) work as a GitHub Actions service container | Pattern 4, Validation | A 2025 regression was reported for healthcheck in some 26.3.0 images; may need to pin a known-good tag or use a TCP/HTTP readiness loop instead of the container HEALTHCHECK `[CITED: github keycloak#41658]` |
| A6 | The host-shell can cross-site-iframe the tenant app without the tenant app sending `X-Frame-Options: DENY` / a restrictive `frame-ancestors` CSP | Architecture | The example app must NOT set framing headers that block the host-shell origin; verify Next.js defaults / set `frame-ancestors` to allow the host-shell |

## Open Questions (RESOLVED)

1. **Does Chrome commit a redirect-hop `Partitioned` Set-Cookie from an iframe `fetch` to the embedding partition?**
   - What we know: The CHIPS spec says the partition key is the top-level site at request start, independent of transport (navigation/redirect/fetch) `[CITED: privacysandbox.google.com/3pcd/chips]`. This strongly favors fetch.
   - What's unclear: Real Chrome behavior for the specific fetch→302→Set-Cookie path is not separately documented; D-10 exists to observe it live on the cross-site preview.
   - Recommendation: Implement fetch behind the seam (Pattern 3); run the manual DevTools check (Validation Architecture); record the observed result; keep Variant B (navigation) ready as fallback.
   - RESOLVED: resolved at execution via the Plan 05 live DevTools check; fetch is the standing default behind the swappable D-10 seam until the live observation confirms or overrides it.

2. **Where is `tid` exposed by the Auth.js v5 Entra provider?**
   - What we know: Multi-tenant tokens carry `tid`; Auth.js exposes `profile`/`account` in the `jwt` callback.
   - What's unclear: Whether `profile.tid` is populated directly or must be decoded from `account.id_token`.
   - Recommendation: Try `profile.tid` first; fall back to decoding the `id_token` JWT. Confirm during execution against the live Entra token.
   - RESOLVED: resolved at execution — try `profile.tid`, else decode `account.id_token`; owned by Plan 01 Task 2 (auth.ts).

3. **Which Keycloak image tag is stable for the CI service container?**
   - What we know: A 2025 healthcheck regression was reported for some 26.3.0 images `[CITED: github keycloak#41658]`.
   - Recommendation: Pin a known-good `26.x` tag and use an explicit HTTP readiness poll (`GET :9000/health/ready` with `KC_HEALTH_ENABLED=true`, or a `start-dev`-friendly TCP wait) rather than relying solely on the image HEALTHCHECK.
   - RESOLVED: resolved — pin a known-good 26.x tag + explicit readiness poll; owned by Plan 04 Task 2 (CI workflow).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build/dev | ✓ | v22.15.0 | — |
| pnpm | Workspace | ✓ | 9.3.0 | — |
| Docker | Keycloak CI (local repro) | ✓ (running) | present | CI uses GitHub Actions services regardless |
| Vercel CLI | Preview deploy | ✗ | — | Deploy via Vercel Git integration (dashboard) instead of CLI |
| Upstash Redis instance | Live roundtrip (EXAMPLE-02) | ✗ (not provisioned) | — | Provision via Vercel Marketplace → Upstash; no code fallback (KV mandatory on serverless) |
| Microsoft Entra app registration | EXAMPLE-02 | ✗ (not provisioned) | — | No fallback — a real multi-tenant Entra registration is required for the live preview |

**Missing dependencies with no fallback:**
- A real multi-tenant Entra app registration (EXAMPLE-02 cannot be satisfied without it).
- A provisioned Upstash Redis store for the preview (in-memory fails by construction).

**Missing dependencies with fallback:**
- Vercel CLI — use the dashboard/Git integration instead.

> These provisioning steps are human/portal actions. The planner should gate EXAMPLE-02 behind a `checkpoint:human-verify` (Entra registration + Upstash store + Vercel env vars in place) before the live-roundtrip task.

## Validation Architecture

> nyquist_validation is enabled (config: `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.8` (project-wide; matches `packages/core`) |
| Config file | none at example root yet — Wave 0 adds one (or reuse root config) |
| Quick run command | `pnpm --filter <example> test` (Keycloak roundtrip unit/integration) |
| Full suite command | `pnpm -r test` (whole workspace incl. `packages/core`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXAMPLE-01 | Popup roundtrip across ≥2 tenants end-to-end | manual (live browser, cross-site) + CI roundtrip mechanics | manual DevTools procedure (below) + `pnpm --filter <example> test` | ❌ Wave 0 |
| EXAMPLE-02 | Live Vercel preview against real Entra, KV-backed roundtrip works | manual-only (live preview, real IdP) | n/a — checkpoint:human-verify on the deployed preview | ❌ Wave 0 |
| EXAMPLE-03 | Bridge mechanics green against a generic OIDC (Keycloak) session | integration (CI, dockerized Keycloak) | `pnpm --filter <example> test` in the Keycloak CI job | ❌ Wave 0 |
| EXAMPLE-04 | Per-tenant `application/manifest+json` per request; `/install-pwa` inert+labeled | unit/integration (route handler) | `pnpm --filter <example> test` (assert Content-Type + per-tenant body) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter <example> test` (fast: manifest + Keycloak-roundtrip units)
- **Per wave merge:** `pnpm -r test` (whole workspace stays green; `packages/core` invariants don't regress)
- **Phase gate:** Full suite green + the manual live-preview observations recorded before `/gsd-verify-work`

### CI-automatable vs Manual (THREAT-06 / D-11 honesty boundary)
**CI-automatable assertions:**
- EXAMPLE-03: real Keycloak auth-code+PKCE session established (browserless script) → `/auth/bridge` mints a handle → `/auth/consume` returns 302 with `Partitioned` Set-Cookie → handle is one-time (replay → 4xx). Asserts emission + mechanics, NOT browser partition isolation.
- EXAMPLE-04: manifest route returns `Content-Type: application/manifest+json`, distinct per-tenant body, and `force-dynamic` (per-request) behavior; `/install-pwa` contains the "Mode B preview — not wired" label and wires no service worker / no Mode B auth.

**Manual / live-preview observations (cannot be CI-automated — the D-11 boundary):**
- EXAMPLE-01/02: the cross-site popup roundtrip on the live preview signs the iframe in across ≥2 tenants.
- **THREAT-06 real CHIPS partition isolation (the live observation Phase 4 deferred here):**
  - Manual DevTools procedure: open `<host-shell>.vercel.app` (which cross-site-iframes `<app>.vercel.app/t/acme`); trigger the popup sign-in; after `redeemHandle` runs, in DevTools → Application → Cookies, confirm the session cookie carries `Partitioned` and appears under the partition keyed to `<host-shell>` (top-level site), and that loading the tenant app under a *different* host partition does NOT see the cookie. Record the result.
  - **D-10 transport observation:** with the fetch variant active, confirm the `Partitioned` Set-Cookie from the consume 302 commits to the iframe partition (subsequent request carries the cookie). If it does, lock fetch; if not, switch the seam to navigation and re-observe. Record which transport was chosen and the evidence.
- Any change here touching bridge/consume/cookie/detection requires a `docs/threat-model.md` update + negative test (CLAUDE.md threat-model discipline). The live observation should be recorded as the THREAT-06 manual-check evidence the threat model's honesty boundary points to.

### Wave 0 Gaps
- [ ] `examples/<app>/` workspace package skeleton (package.json, tsconfig, next config) — first occupant of `examples/*`
- [ ] Vitest config for the example (or reuse root) — covers EXAMPLE-03/04
- [ ] `tests/manifest.test.ts` — Content-Type + per-tenant + force-dynamic assertions (EXAMPLE-04)
- [ ] `tests/keycloak-roundtrip.test.ts` + the browserless PKCE login helper (EXAMPLE-03)
- [ ] `keycloak/realm-export.json` — pre-seeded realm with a PKCE-S256 client + a test user
- [ ] `.github/workflows/keycloak-agnosticism.yml` — Keycloak service container + readiness poll + the roundtrip test
- [ ] `.env.example` — documented placeholders (D-04)
- [ ] A written manual-validation procedure doc for the live CHIPS observation (EXAMPLE-01/02 + THREAT-06)

## Security Domain

> `security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Auth.js v5 OIDC (Entra `/common`, Keycloak); `verifySession` is the real gate (ROUTE-01) |
| V3 Session Management | yes | CHIPS partitioned session cookie (`Partitioned; Secure; HttpOnly; SameSite=None`) set by `consume`; opaque one-time handle ≤60s (STORE) |
| V4 Access Control | yes | Tenant assertion via `tid` claim; middleware is UX-only routing, NOT a gate (CLIENT-04/THREAT-04) |
| V5 Input Validation | yes | `sanitizeNext` rejects `/auth`,`/api/auth`,absolute,protocol-relative (THREAT-08); Origin allowlist on both routes |
| V6 Cryptography | yes | 256-bit CSPRNG handle (`randomBytes(32)`), PKCE S256 (Auth.js + Keycloak client) — never hand-rolled |
| V13 API/Web Service | yes | `postMessage` origin+source checks (THREAT-03); no token in any URL (THREAT-07/09/10) |

### Known Threat Patterns for {Next.js App Router + Auth.js + cross-site iframe}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged `postMessage` from a malicious window | Spoofing | `isTrustedMessage`: origin allowlist AND pinned `event.source` (THREAT-03) |
| Handle replay / forgery at consume | Tampering | Atomic `getdel` one-time-use; forged/expired/replayed → 4xx no cookie (THREAT-06) |
| Session token leaking via URL | Information Disclosure | Token only in `Set-Cookie`; only the opaque `code` may appear in a URL (THREAT-07/D-15) |
| Open redirect via `next` | Tampering | `sanitizeNext` degrades unsafe targets to `/` (THREAT-08) |
| Context-signal spoofing to bypass auth | Elevation of Privilege | Detection is UX routing only; real gate is `verifySession` (THREAT-04) |
| Clickjacking the cross-site iframe | Tampering/Spoofing | Set `frame-ancestors` CSP to allow ONLY the intended host-shell origin (don't leave framing wide open; don't block it with `DENY`) — A6 |
| Cross-tenant cookie leakage | Information Disclosure | CHIPS partitioning isolates the cookie to the embedding top-level site (the live observation proves this) |

## Project Constraints (from CLAUDE.md)

- **Functional style — no classes** in the public surface and any example-local helpers (factory functions / closures over deps).
- **TypeScript `strict: true`; no `any`** outside test scaffolding.
- **Vitest with explicit negative cases** — the Keycloak roundtrip and manifest tests carry negative coverage (replay → 4xx, wrong media type, etc.).
- **Conventional Commits**, atomic, one logical change per commit; no emoji in code/commits.
- **NO internal requirement IDs** (`D-NN`/`THREAT-NN`/`CLIENT-NN`/`EXAMPLE-NN`/`HARDEN-NN`) in any committed `examples/` or `.github/` source or comment (discreet mandate extends to `examples/`). `THREAT-NN` only where legitimately referencing `docs/threat-model.md` as published docs.
- **Threat-model discipline:** any change touching bridge/consume/cookie/detection → `docs/threat-model.md` update + negative test. The live CHIPS observation is the THREAT-06 manual-check evidence.
- **MIT license** declared once at root — NO per-file SPDX/headers.
- **No `Co-Authored-By` trailer** in commits (user global preference).
- **`packages/core` stays React-free** — React lives ONLY in `examples/` (D-13).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Path-based `/t/[tenant]` tenancy on a single app origin (≥2 tenants). Reject subdomain/tenant-switcher.
- **D-02 (amended by D-09):** iframe-embed demonstrated by a host-shell page — but the host-shell MUST be a **separate site** from the embedded tenant app (two `*.vercel.app` deployments, cross-site via PSL), NOT a same-origin route.
- **D-03:** One multi-tenant Entra registration via `/common` (or `/organizations`); tenant from the `tid` claim.
- **D-04:** Secrets ONLY in Vercel env + GitHub Actions secrets; ship `.env.example` placeholders. Nothing real committed.
- **D-05:** Dockerized Keycloak service container with a pre-seeded realm as the generic-OIDC CI provider (real discovery + PKCE).
- **D-06:** Keycloak CI exercises bridge mechanics against a real Keycloak session via programmatic login (NOT a full headless-browser popup E2E / no Playwright).
- **D-07:** Dynamic per-tenant manifest route (per-request `application/manifest+json`) + `/install-pwa` labeled "Mode B preview — not wired". No service worker, no Mode B auth.
- **D-08:** Clean, minimal, self-documenting UX; visible roundtrip state + inline explanatory copy. No design system / minimal-or-no CSS framework.
- **D-09 (MANDATORY):** Cross-site host↔iframe — host-shell origin ≠ app origin. A same-origin demo makes the gate hollow and cannot observe CHIPS. Two `*.vercel.app` deployments.
- **D-10:** Author the real opener-drives-consume code behind a single swappable seam (fetch | navigation). Run the live cross-site browser check; pick the transport from the observed result; record it. Do NOT hard-code fetch or navigation before the check.
- **D-13 (Phase 3, carried):** The example authors the real `/auth/popup` React component wrapping `runPopupFlow(deps)`. `packages/core` stays React-free.
- **KV mandatory on Vercel:** in-memory fails the roundtrip by construction on serverless; use `next-auth-bridge/store/kv`.
- **`detectContext` open-union:** `'iframe' | 'browser' | 'pwa-shell'` with default-fallback callsites.
- **Discreet mandate extends to `examples/`:** no internal req-IDs in committed example/CI source.

### Claude's Discretion
- Exact `examples/` app name/slug and internal file layout (workspace already globs `examples/*`).
- Auth.js v5 config shape, Entra provider wiring, and the precise programmatic Keycloak-login mechanism.
- KV provider concrete choice behind `./store/kv` (Upstash Redis via marketplace vs standalone) — whichever provisions simplest.
- Demo tenant set (names/count) — at least two.

### D-05/D-06 Resolution (researcher mandate from the caveat)
**Recommendation: option (a) — drive the auth-code + PKCE step with a browserless agent (curl/fetch script), NOT direct-access-grant.**

Rationale: D-05's entire justification for Keycloak over a test/credentials provider is *real OIDC discovery + real PKCE* (which is also what validates THREAT-05 against a second real provider). Keycloak's direct-access-grant (ROPC) exchanges username/password for tokens directly at the token endpoint and **never runs auth-code+PKCE** — choosing it would make CI green while silently proving nothing about PKCE, voiding D-05. A browserless auth-code+PKCE flow is well-established (documented curl-script pattern: generate `code_verifier`/`code_challenge`, GET the authorization endpoint, parse the login-form `action`, POST credentials with the KC session cookies, follow the redirect to capture `?code=`, POST `code + code_verifier` to `/token`) `[CITED: thrysoee.dk/keycloak-authorization-code-login + keycloak.org securing-apps]`. This preserves real PKCE while honoring D-06's "programmatic login, NOT a full browser / no Playwright" spirit — no headless browser, no popup E2E, just HTTP form-walking. The realm-export JSON must configure the client with **Standard flow enabled + PKCE `S256`** (and Direct Access Grants disabled, to make the PKCE path the only one).

If — and only if — the form-walking proves brittle in CI, the documented fallback is ROPC, but **then D-05's real-PKCE claim must be dropped** and the CI re-described as "proves the bridge works with a generic Keycloak session" (no PKCE assertion). Do not keep citing real PKCE while running ROPC.

### Deferred Ideas (OUT OF SCOPE)
- Real enterprise-host validation (SharePoint/Teams Tab) — manual procedure at most, Phase 6 / post-publish.
- Inert service worker in the PWA scaffold — blurs the "inert" boundary; left out.
- Polished/branded UI with a UI-SPEC — declined; UX stays clean-minimal.
- `next-auth-bridge/react` subpath shipping a ready-made `/auth/popup` — forward-compat, not v0.1.
- Minimal popup-only example (EXAMPLE-05) and Upstash *adapter* (STORE-07) — roadmap-deferred to v0.1.x/v0.2.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXAMPLE-01 | Multi-tenant App Router example demonstrates the popup roundtrip end-to-end | Pattern 1 (Entra multi-tenant), Patterns 2–3 (KV + opener seam), `/auth/popup` page; cross-site host-shell (D-09); ≥2 `/t/[tenant]` |
| EXAMPLE-02 | Deploys to a Vercel preview against a real Entra registration using the KV adapter | Pattern 2 (Upstash via `Redis.fromEnv()`), Environment Availability (provisioning checkpoints), `.env.example` (D-04) |
| EXAMPLE-03 | Provider-agnostic proof — bridge mechanics tested in CI against generic OIDC (Keycloak) | Pattern 4 (browserless auth-code+PKCE), D-05/D-06 resolution, Validation Architecture (CI job + realm-export) |
| EXAMPLE-04 | Per-tenant dynamic PWA manifest + inert labeled `/install-pwa` | Pattern 5 (`application/manifest+json` + `force-dynamic`), Pitfall 4, manifest test |

## Sources

### Primary (HIGH confidence)
- Codebase: `packages/core/src/{index,consume-route,popup-flow,open-auth-popup,middleware,types}.ts`, `transfer-store/kv.ts`, `docs/threat-model.md`, `package.json`, `pnpm-workspace.yaml` — the exact package surface the example consumes.
- authjs.dev/getting-started/providers/microsoft-entra-id — Entra v5 provider config, issuer values, env var names.
- authjs.dev/getting-started/providers/keycloak — Keycloak v5 provider config, issuer (realm URL) format, env var names.
- privacysandbox.google.com/3pcd/chips — CHIPS partition-key rule (top-level site; transport-independent), Partitioned/Secure/SameSite=None requirements.
- npm registry (`npm view`): `next` 16.2.7, `next-auth@beta` 5.0.0-beta.31, `@upstash/redis` 1.38.0, `react`/`react-dom` 19.2.7; `next-auth` dist-tags (latest=v4, beta=v5).
- slopcheck 0.6.1: all phase packages [OK].

### Secondary (MEDIUM confidence)
- vercel.com/docs/redis + community.vercel.com — Vercel KV → Upstash Redis migration (Dec 2024), env var injection.
- Vercel KB (cookie at vercel.app level) — confirms `vercel.app` is on the Public Suffix List (cross-site between two `*.vercel.app` deployments).
- nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest + route-handler caching — `force-dynamic` for per-request manifests.
- keycloak.org/server/containers + securing-apps/oidc-layers — `--import-realm`, PKCE S256 client config, auth-code vs direct-grant.
- learn.microsoft.com/howto-convert-app-to-be-multi-tenant — multi-tenant `iss`/`tid` validation.

### Tertiary (LOW confidence — flagged for validation)
- thrysoee.dk/keycloak-authorization-code-login — browserless curl auth-code+PKCE script pattern (community; cross-checked against Keycloak docs).
- github.com/keycloak/keycloak#41658 — 2025 healthcheck regression report (informs pinning a known-good image + explicit readiness poll).
- Real Chrome fetch+302+Partitioned commit behavior — spec-CITED but live-observation REQUIRED (D-10).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified on npm; v4/v5 dist-tag trap confirmed; slopcheck clean.
- Architecture: HIGH — cross-site CHIPS requirement and partition-key rule confirmed against the spec and Vercel/PSL; the package surface read directly from source.
- CHIPS transport (fetch vs navigation): MEDIUM-HIGH — spec strongly favors fetch; live observation still required by D-10.
- Keycloak CI mechanics: MEDIUM — browserless PKCE is established but the exact realm-export + readiness wiring needs execution-time iteration (image-tag pinning).
- Pitfalls: HIGH — derived from source, the threat model, and verified ecosystem changes.

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 for stable items; ~2026-06-23 for the `next-auth@beta` pin and Keycloak image tag (fast-moving).
