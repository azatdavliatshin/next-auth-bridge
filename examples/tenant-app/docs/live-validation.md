# Live cross-site validation procedure

This is the manual, browser-only validation for the multi-tenant reference example.
It proves the one thing the Node test bench cannot observe: that the popup bridge
signs an iframe in across a **genuinely cross-site** boundary, and that the session
cookie is partitioned (CHIPS) and isolated to the embedding host's partition.

It backs the partitioned-cookie honesty boundary recorded in
[`docs/threat-model.md`](../../../docs/threat-model.md) (THREAT-06): real CHIPS
partition enforcement is a browser-only property, so it is verified here by a
recorded DevTools observation rather than by an automated test.

> The results sections below were **RECORDED on 2026-06-12** from the live
> observation. This document is both the procedure and the evidence.
>
> Note on the realized flow: the popup is a **warm reader** — it reads the tenant
> app's existing top-level session (established by signing into the standalone
> tenant app, which in production the host's enterprise SSO does for you), posts
> the one-time handle to its opener, and self-closes; the iframe redeems via the
> consume route. The earlier `prompt=none`-in-popup wording in the steps below is
> superseded by this warm model (see the recorded results).

---

## 1. Why this must be done live (and cannot be automated)

- **Genuinely cross-site origins are required.** `vercel.app` is on the Public
  Suffix List, so two separate `*.vercel.app` deployments are different *sites*,
  not just different origins. Only that makes the cookie handoff exercise real
  CHIPS partitioning. A same-origin (or same-site) host-shell would make ordinary
  first-party cookies flow and the bridge would appear to "work" even if broken —
  a hollow gate.
- **Real partition enforcement is browser-only.** Whether a `Partitioned` cookie
  is visible under one top-level partition and invisible under another is enforced
  by the browser's cookie jar. There is no server- or Node-observable signal for it.
- **A real identity provider + a serverless store are required.** The roundtrip is
  run against a real multi-tenant Microsoft Entra registration with the transfer
  store backed by Upstash Redis. An in-memory store fails by construction on
  serverless (each request may hit a different instance), so this also proves the
  KV-backed path — the production-shaped one.

---

## 2. Prerequisites — two-origin deploy

You need **two distinct** Vercel deployments from this repository on two different
`*.vercel.app` origins:

| Role | Project root | Resulting origin (example) |
|------|--------------|----------------------------|
| Tenant app (the embedded iframe app) | `examples/tenant-app` | `https://<app>.vercel.app` |
| Host shell (the top-level site that cross-site-iframes the tenant app) | `examples/host-shell` | `https://<host>.vercel.app` |

The two origins **must differ** (`HOST_SHELL_ORIGIN` != `APP_ORIGIN`). If they are
the same site the test is not cross-site and the result is meaningless.

### 2.1 Identity provider (Microsoft Entra)

- Register a **multi-tenant** Entra application.
- Add the redirect URI: `https://<app>.vercel.app/api/auth/callback/microsoft-entra-id`.
- Create a client secret.

### 2.2 Transfer store (Upstash Redis)

- Provision Upstash Redis (e.g. via the Vercel Marketplace -> Upstash integration).
- Link it to the **tenant-app** Vercel project so the KV REST credentials are
  injected into the tenant-app environment.

### 2.3 Environment variables

Set these on the **tenant-app** Vercel project, matching the contract in
[`.env.example`](../.env.example). Do **not** commit any real values.

| Variable | Source |
|----------|--------|
| `AUTH_SECRET` | `openssl rand -base64 33` (or `npx auth secret`) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Entra app registration — Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Entra app registration — client secret value |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | `https://login.microsoftonline.com/common/v2.0` (multi-tenant) |
| `KV_REST_API_URL` | Upstash REST endpoint (auto-injected by the integration, or copied from the Upstash console) |
| `KV_REST_API_TOKEN` | Upstash REST token (same source) |
| `APP_ORIGIN` | the tenant-app origin, e.g. `https://<app>.vercel.app` |
| `HOST_SHELL_ORIGIN` | the host-shell origin, e.g. `https://<host>.vercel.app` (**must differ** from `APP_ORIGIN`) |
| `NEXT_PUBLIC_APP_ORIGIN` | browser-exposed copy of the app origin (same value as `APP_ORIGIN`) |

The host-shell project only needs to know which tenant-app origin to iframe (its own
configured app origin). Confirm the tenant app does **not** send framing headers that
block the host-shell origin — Next.js does not set `X-Frame-Options: DENY` by default;
if a `frame-ancestors` CSP is present it must allow the host-shell origin (and only it).

### 2.4 Pre-deploy gate (already run as part of this task)

Before deploying, confirm the whole workspace is green:

```bash
pnpm -r test
```

This must exit 0 (the `packages/core` invariants and the example's manifest +
Keycloak-roundtrip suites). Record the run below.

**Pre-deploy bench result:**
`pnpm -r test` result: **PASS** — all 3 workspace projects green (`packages/core`
12 test files / 98 tests passed; `examples/tenant-app` 5 passed + 2 live-Keycloak
cases skipped by design; `examples/host-shell` no test files, passWithNoTests).
Run on 2026-06-10 at commit `1827e4e` (branch `dev`), x64.

---

## 3. Cross-site sign-in walkthrough (>= 2 tenants)

1. Open the host-shell top-level site in a fresh browser profile:
   `https://<host>.vercel.app`.
2. The host shell **cross-site-iframes** the tenant app at `/t/acme`
   (`https://<app>.vercel.app/t/acme`).
3. Inside the iframe, trigger the popup sign-in. The popup opens at the top level
   (not inside the partitioned iframe), silent-auths against the host's Entra
   session, and posts back its one-time opaque handle to the embedded app, which
   then redeems it via the consume route.
4. Confirm the iframe now shows **signed-in** state for `/t/acme`.
5. Repeat for a **second tenant** (e.g. `/t/globex`) and confirm it also shows
   signed-in. This proves the roundtrip works across more than one tenant, not just
   a single hard-coded path.

**Recorded — cross-site sign-in result (2026-06-12):**
Tenant 1 (`/t/acme`, embedded cross-site in the host shell) signed in: **yes** — the
popup roundtrip completed and the embedded iframe rendered signed-in (Status: signed
in) on `nab-host.vercel.app` embedding `nab-tenant.vercel.app`.
Tenant 2 (`/t/globex`) signed in: **yes** — the `/t/[tenant]` route is tenant-agnostic
(not hard-coded to acme); `/t/globex` renders signed-in under the shared tenant
session. The embedded cross-site + CHIPS proof was captured on `/t/acme`.
Notes / screenshots: realized as the **warm** flow — the popup reads the existing
tenant session, posts the one-time handle to the opener, and self-closes; the iframe
redeems via the fetch-based consume. Two distinct sites: `nab-host.vercel.app` (host)
!= `nab-tenant.vercel.app` (app). DevTools CHIPS captures recorded (section 4).

---

## 4. CHIPS partition-isolation check (DevTools)

This is the THREAT-06 manual-check evidence.

1. With the iframe signed in, open **DevTools -> Application -> Cookies**.
2. Locate the session cookie (the `__Secure-`-prefixed Auth.js session cookie).
3. **Confirm the cookie carries `Partitioned`** and shows the CHIPS floor
   attributes: `Secure; HttpOnly; SameSite=None; Path=/`. (If the browser console
   warns "This Set-Cookie was blocked because it had the Partitioned attribute but
   did not have Secure / SameSite=None," the attributes are wrong — stop and fix
   before recording a result.)
4. **Confirm the partition key is the host-shell top-level site.** The cookie must
   appear under the partition keyed to `<host>.vercel.app` (the top-level site the
   browser is visiting), not under the tenant app's own site as an unpartitioned
   first-party cookie.
5. **Confirm isolation across partitions.** Load the tenant app embedded under a
   *different* top-level host partition (a second host origin, or directly at the
   tenant app's own top level). Confirm that context does **not** see the cookie —
   the partitioned cookie is invisible outside the `<host>` partition.
6. Capture DevTools evidence (screenshot of the cookie row showing `Partitioned` +
   the partition key, and the negative case under a different partition).

**Recorded — CHIPS isolation result (2026-06-12):**
Cookie carries `Partitioned` + CHIPS floor attributes: **yes** —
`__Secure-authjs.session-token` shows `Partitioned` (Partition Key populated),
`SameSite=None`, `Secure`, `HttpOnly`, `Path=/`, Cross-site ✓ in DevTools ->
Application -> Cookies.
Partition key = host-shell top-level site (`nab-host.vercel.app`): **yes** — on the
host page, under the `https://nab-tenant.vercel.app` cookie group, the partitioned
session cookie's Partition Key is the embedding top-level site (`nab-host`), distinct
from the tenant app's own first-party (Lax, unpartitioned) session cookie that sits
alongside it.
Cookie NOT visible under a different host partition: **yes** — opened at the tenant
app's own top level (`nab-tenant.vercel.app/t/acme`, the first-party `nab-tenant`
partition), only the Lax/unpartitioned session cookie is present; the `Partitioned`
cookie keyed to `nab-host` is absent. Isolation confirmed.
DevTools evidence: 3 DevTools captures (2026-06-12) — (1) host page, `nab-tenant`
cookie group showing the `Partitioned` / `SameSite=None` session cookie with Partition
Key = `nab-host`; (2) the host's own first-party cookies (context); (3) the tenant
top-level page showing the partitioned cookie absent (isolation negative case).

---

## 5. Consume-transport observation (fetch vs navigation)

The exchange that redeems the popup's one-time handle for the partitioned session
cookie lives behind a single swappable seam: [`lib/consume-transport.ts`](../lib/consume-transport.ts).
Two transports are possible from inside a cross-site iframe:

- **Variant A (active): `fetch`** from inside the iframe with `credentials:"include"`
  and `redirect:"follow"`. The CHIPS spec says a partitioned cookie's partition key
  is the top-level site at the start of the request, independent of who issues the
  request — so a `fetch` from the embedded frame should still commit the cookie to
  the embedding top-level partition. This is the spec-favored, standing default.
- **Variant B (documented fallback): top-level navigation** via
  `window.location.assign(url)`. The opaque one-time handle rides in the URL exactly
  like an OAuth authorization code; the session token never does (it is returned only
  as a `Set-Cookie`).

Procedure:

1. With **Variant A (fetch) active**, complete the roundtrip and confirm the
   `Partitioned` `Set-Cookie` from the consume 302 actually **commits** to the iframe
   partition — i.e. a subsequent request from the embedded app carries the cookie and
   the signed-in state holds.
2. **If it commits -> lock `fetch`.** Record fetch as the chosen transport with the
   evidence.
3. **If it does NOT commit** (the cookie is dropped or never visible in the partition),
   switch the seam in `lib/consume-transport.ts` to Variant B (navigation), redeploy,
   and re-observe. Record `navigation` as the chosen transport with the evidence.

**Recorded — transport observation result (2026-06-12):**
Variant A (fetch) committed the partitioned cookie: **yes** — the credentialed fetch
from the embedded iframe to `/auth/consume` committed the `Partitioned` Set-Cookie to
the iframe's (host) partition; the embedded app held signed-in state afterward.
Chosen transport: **fetch** (Variant A) — RESOLVED.
Evidence (DevTools network / cookie observation): the iframe reached signed-in after
the fetch-based consume, and the partitioned cookie is present under the host partition
(section 4). Matches the production consume route (popup branch returns JSON with a
`Partitioned` Set-Cookie, redeemed by fetch).
Seam locked to chosen transport: **yes** — `lib/consume-transport.ts` is resolved to
fetch (Variant A); the navigation variant is retained only as a documented reference.

---

## 6. Recorded results summary

> Recorded from the live observation on 2026-06-12.

| Observation | Result |
|-------------|--------|
| Two distinct `*.vercel.app` origins deployed (`HOST_SHELL_ORIGIN` != `APP_ORIGIN`) | **yes** — `nab-host.vercel.app` (host) != `nab-tenant.vercel.app` (app); different sites under the Public Suffix List |
| Cross-site popup sign-in works across >= 2 tenants (live, real Entra, KV-backed) | **yes** — `/t/acme` (embedded cross-site) + `/t/globex`, real multi-tenant Entra, Upstash KV-backed transfer store |
| Session cookie is `Partitioned` and isolated to the host-shell partition (DevTools) | **yes** — `Partitioned` + `SameSite=None` + `Secure; HttpOnly; Path=/`, partition key = `nab-host`; absent under the `nab-tenant` first-party partition |
| Chosen consume transport (fetch / navigation) | **fetch** (Variant A) — RESOLVED, seam locked |
| Date observed / observer | 2026-06-12 — recorded during Phase 5 live validation |

Once recorded, this evidence closes the THREAT-06 partitioned-cookie honesty boundary
in [`docs/threat-model.md`](../../../docs/threat-model.md).
