# Live cross-site validation procedure — Better Auth set

This is the manual, browser-only validation for the **Better Auth** reference example
(`ba-host-shell` + `ba-tenant-app`). It is the Better Auth analog of the Auth.js set's
[`examples/tenant-app/docs/live-validation.md`](../../tenant-app/docs/live-validation.md),
and it proves the one thing the Node test bench cannot observe: that the popup bridge
signs a Better Auth iframe in across a **genuinely cross-site** boundary, that the
session cookie is partitioned (CHIPS) and isolated to the embedding host's partition,
and that the cold-start silent re-auth is genuine `prompt=none` parity — not a
downgraded interactive login.

Auth.js evidence does **not** transfer (RELEASE-06): the values below are FRESH
observations from the Better Auth deploy on its own `nab-ba-*` origins.

> The results sections below were **RECORDED on 2026-07-03** from live observation
> against the deployed Better Auth example set. This document is both the procedure
> and the evidence.

---

## 1. Why this must be done live (and cannot be automated)

- **Genuinely cross-site origins are required.** `vercel.app` is on the Public Suffix
  List, so `nab-ba-host.vercel.app` and `nab-ba-tenant.vercel.app` are different
  *sites*, not just different origins. Only that makes the cookie handoff exercise
  real CHIPS partitioning.
- **Real partition enforcement is browser-only.** Whether a `Partitioned` cookie is
  visible under one top-level partition and invisible under another is enforced by the
  browser's cookie jar. There is no Node-observable signal for it.
- **Cold-start `prompt=none` is browser-only.** Whether the silent re-auth surfaces an
  interactive Keycloak login page or completes silently can only be observed live
  against the real IdP (the D-07 parity bar).
- **A real identity provider + a serverless store + a hosted DB are required.** The
  roundtrip runs against the shared Railway Keycloak `bridge-agnosticism` realm, with
  the transfer store backed by the Better Auth set's OWN Upstash Redis namespace (D-02)
  and Better Auth's session/user tables in hosted libSQL/Turso (D-03).

---

## 2. Prerequisites — two-origin deploy

| Role | Project root | Origin |
|------|--------------|--------|
| Better Auth tenant app (embedded iframe app) | `examples/ba-tenant-app` | `https://nab-ba-tenant.vercel.app` |
| Better Auth host shell (top-level site that cross-site-iframes the tenant) | `examples/ba-host-shell` | `https://nab-ba-host.vercel.app` |

The two origins **must differ** (`HOST_SHELL_ORIGIN` != `APP_ORIGIN`). Env-var contract
is in [`.env.example`](../.env.example) (tenant) and
[`../ba-host-shell/.env.example`](../../ba-host-shell/.env.example) (host). Both apps
need `TURSO_DATABASE_URL` set on deploy (D-03 — the host is also authenticated and
needs its own session store; without it `lib/db.ts` falls to the ephemeral
better-sqlite3 file branch).

### 2.1 Identity provider (shared Keycloak, D-06)

- Shared `bridge-agnosticism` realm / `bridge-example-app` client (same as the Auth.js
  set — the sameness is the point).
- The `bridge-example-app` client **requires PKCE** (`code_challenge_method=S256`), so
  the Better Auth genericOAuth provider MUST pass `pkce: true` (see `lib/auth.ts`).
- Live realm allowlist (admin console) must include the BA callback paths for both
  origins: `.../api/auth/oauth2/callback/keycloak` and `.../keycloak-silent`, plus both
  `nab-ba-*` web origins.

### 2.2 Transfer store (Upstash Redis — the BA set's OWN namespace, D-02)

A distinct Upstash Redis database from the Auth.js deploy, so the two deploys' one-time
codes never collide. Set `KV_REST_API_URL` / `KV_REST_API_TOKEN` on the tenant project.

### 2.3 Pre-deploy gate

`pnpm -r test` must exit 0.

**Pre-deploy bench result:** `pnpm -r test` result: **PASS** — `packages/core` 15 files
/ 136 tests; `examples/ba-tenant-app` 4 files / 7 passed + 1 Turso-guarded case skipped
locally (runs on deploy); `examples/tenant-app` 5 passed + 2 skipped (Auth.js baseline
untouched); host shells no test files (passWithNoTests). Both `ba-*` apps
`tsc --noEmit` clean. Run on 2026-07-03 on Node 22 at commit `b22d02f`.

---

## 3. Cross-site sign-in walkthrough (warm handoff)

1. Open the host top-level site in a fresh browser profile: `https://nab-ba-host.vercel.app`.
2. Sign in on the host against the shared Keycloak realm (establishes the SSO session).
3. The host cross-site-iframes the tenant at `/t/acme`
   (`https://nab-ba-tenant.vercel.app/t/acme`). Inside the iframe, trigger the popup
   sign-in. The popup opens at the top level (not inside the partitioned iframe),
   silently reuses the host's Keycloak session, posts back a one-time opaque handle to
   the embedded app, and self-closes; the iframe redeems via the consume route.
4. Confirm the iframe now shows **signed-in** state for `/t/acme`.

**Recorded — cross-site sign-in result (2026-07-03):**
Host sign-in (Keycloak user `bridge-test-ba-user@example.test`) established the SSO
session: **yes** — host holds a `__Secure-better-auth.session_token` (single-prefixed;
`HttpOnly; Secure; SameSite=None`; Partition Key = `nab-ba-host`).
Tenant (`/t/acme`, embedded cross-site in the host shell) signed in: **yes** — started
signed-out ("Sign In" button, empty tenant cookie); clicking Sign In opened a top-level
popup that opened-and-closed with **no interactive Keycloak login page**, and the
embedded iframe then rendered signed-in. Two distinct sites:
`nab-ba-host.vercel.app` (host) != `nab-ba-tenant.vercel.app` (app).
Cookie name: **`__Secure-better-auth.session_token`** — single `__Secure-` prefix (an
earlier build double-prefixed to `__Secure-__Secure-...`; fixed in commit `b22d02f` by
passing the base name to Better Auth, which adds the prefix itself).

---

## 4. CHIPS partition-isolation check (DevTools)

**Recorded — CHIPS isolation result (2026-07-03):**
Cookie carries `Partitioned` + CHIPS floor attributes: **yes** — under
`https://nab-ba-tenant.vercel.app` in DevTools -> Application -> Cookies, the
`__Secure-better-auth.session_token` cookie shows `Secure` ✓, `HttpOnly` ✓,
`SameSite=None`, and the Cross-site/Partitioned column ✓, with the **Partition Key Site
= `https://nab-ba-host.vercel.app`** (the embedding top-level site).
Partition key = host top-level site (`nab-ba-host`): **yes** — the tenant session cookie
is keyed to the embedding host partition, not to the tenant's own first-party site.
Cookie NOT visible outside the host partition: confirmed by the starting state — visited
directly at the tenant's own top level (`nab-ba-tenant.vercel.app/t/acme`), the tenant is
signed-out with no `nab-ba-host`-partitioned cookie present; it only appears after the
cross-site handoff under the host partition.

---

## 5. Cold-start `prompt=none` silent re-auth (D-07 parity bar)

The Better-Auth-specific requirement (BAEXAMPLE-03): with the host SSO session
established, the tenant popup must obtain a session via a `prompt=none` silent re-auth
against the shared Keycloak — with **no interactive login page** — at genuine parity
with the Auth.js demo, never a downgraded "click to sign in" notice.

Procedure: with the host SSO session live, delete the `nab-ba-tenant` cookie and
re-trigger the tenant sign-in. Observe whether the popup surfaces an interactive
Keycloak login page or completes silently. (The `keycloak-silent` genericOAuth entry
emits `prompt=none`; unit-proven in `tests/cold-start-prompt.test.ts`, which also pins
`code_challenge_method=S256`.)

**Recorded — cold-start result (2026-07-03):**
Silent re-auth with NO interactive Keycloak login page: **yes** — after the host SSO
session was established, every subsequent tenant sign-in completed via the popup with no
Keycloak username/password page appearing at any point (observer confirmed: "I did not
see a Keycloak login page"). The popup opened, silently reused the SSO session, and
self-closed. This is genuine `prompt=none` parity, not an interactive downgrade — D-07
bar met. (Unit evidence: `cold-start-prompt.test.ts` asserts `prompt=none` +
`code_challenge_method=S256` on the generated `keycloak-silent` authz URL.)

---

## 6. Seeded LIVE-URL login (BAEXAMPLE-04)

The deterministic seeded test user (`bridge-test-user@example.test`, created via
`auth.api.signUpEmail` in `scripts/seed.ts`) must log in on the LIVE Turso-backed tenant
URL — proving the credential write/read path against hosted libSQL, not just local
SQLite.

**Recorded — seeded login result (2026-07-03):**
Seeded user present in Turso: **yes** — independently queried the deployed Turso DB:
tables `account, session, user, verification` present; exactly one `user`
(`bridge-test-user@example.test`, id `S9GKsxYvJJG0dHw7xb3zmDbkawpcWY4k`) with one
`account` row (`provider=credential`). Idempotency confirmed — a second `pnpm seed` run
returned "seed skipped (user already exists)" (D-04; clears Pitfall 3 — the full
`signUpEmail` write path succeeds against libSQL/Turso).
Live credential login succeeds: **yes** — `POST` to the live
`https://nab-ba-tenant.vercel.app/api/auth/sign-in/email` with the seeded credentials
returned **HTTP 200**, the exact seeded user object, and a valid
`__Secure-better-auth.session_token` Set-Cookie (`HttpOnly; Secure; SameSite=None;
Partitioned`).
Note (honest caveat): the tenant top-level UI currently surfaces only the Keycloak
("Sign in") button, not an email/password form, so the seeded credential login is
reachable via the Better Auth `/api/auth/sign-in/email` endpoint (verified above) but
not via a rendered form. The requirement — the seeded user logs in on the live
Turso-backed URL — is met; a follow-up may add a visible credential form.

---

## 7. Recorded results summary

> Recorded from live observation on 2026-07-03 (commit `b22d02f`, Better Auth set).

| Observation | Result |
|-------------|--------|
| Two distinct `*.vercel.app` origins deployed (`HOST_SHELL_ORIGIN` != `APP_ORIGIN`) | **yes** — `nab-ba-host.vercel.app` != `nab-ba-tenant.vercel.app` (different sites under the Public Suffix List) |
| Warm cross-site popup sign-in signs the embedded tenant in (live, shared Keycloak, KV-backed) | **yes** — `/t/acme` embedded in `nab-ba-host`; started signed-out, popup handoff → signed-in |
| Session cookie name single-prefixed (`__Secure-better-auth.session_token`, no double prefix) | **yes** — fixed in `b22d02f` |
| Session cookie is `Partitioned` and isolated to the host partition (DevTools) | **yes** — `Partitioned` + `SameSite=None` + `Secure; HttpOnly`, Partition Key = `nab-ba-host` |
| Cold-start silent re-auth via `prompt=none` (no interactive login page — D-07 parity) | **yes** — no Keycloak login page observed on the silent path |
| Seeded test user logs in on the LIVE Turso-backed URL (BAEXAMPLE-04) | **yes** — live `/api/auth/sign-in/email` → HTTP 200 + session; user verified present in Turso |
| "Better Auth" banner on host + tenant (BAEXAMPLE-05); distinct `nab-ba-*` URLs (BAEXAMPLE-06) | **yes** — banner renders on both; reachable under `nab-ba-host` / `nab-ba-tenant` |
| Date observed / observer | 2026-07-03 — recorded during Phase 8 live validation |

This fresh Better Auth evidence is the honesty-gate the docs reposition (Phase 9) hard-gates on:
the "auth-library-agnostic" claim ships only because the Better Auth example passes this
live E2E, not from design intent (RELEASE-06). Auth.js evidence does not transfer.
