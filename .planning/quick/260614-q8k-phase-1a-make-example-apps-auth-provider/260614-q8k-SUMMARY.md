---
quick_id: 260614-q8k
slug: phase-1a-make-example-apps-auth-provider
date: 2026-06-14
status: complete
---

# Quick Task 260614-q8k — Summary

Phase 1a: made the example apps' Auth.js provider env-switchable (Microsoft Entra
default | self-hosted Keycloak) so anyone can try the live popup-bridge demo with
a seeded test user, and scaffolded the hosting/deploy as an executable runbook.

## Status: complete (in-repo work shipped; deploy delivered as runbook)

## What changed (6 atomic commits)

| Commit | Part | Change |
|--------|------|--------|
| `cd7a61b` | A1 | `AUTH_PROVIDER_ID` constant in both apps' `lib/auth-provider.ts` |
| `92e69b0` | A2–A5 | Conditional provider in both `auth.ts`; Keycloak `tid` fallback; `signIn` callsites use the constant; `demo` tenant added; host embeds `/t/demo` |
| `8a1c853` | A6 | Keycloak env vars + `DEMO_TENANT_ID` in both `.env.example` |
| `082d2bb` | B | `bridge-example-app` confidential client + `sslRequired: external` in `realm-export.json` |
| `f821f1d` | C/D | `examples/keycloak-demo/`: Dockerfile, docker-compose, pin-secret script, DEPLOY.md runbook |
| `9f9bc88` | E | README "Live demo" section + TOC entry |

## Acceptance criteria

1. **Keycloak end-to-end** — code path wired (env switch, shared realm/client,
   `consentRequired:false`, `tid=demo` collapse). Live verification (criterion 1)
   and the evidence screenshot require the deploy in
   [DEPLOY.md](./../../../examples/keycloak-demo/DEPLOY.md) — that's the user's step.
2. **Default path unaffected** — ✅ `pnpm --filter tenant-app-example test` green
   (5 passed / 2 skipped) in both Entra and Keycloak modes; both apps `next build`
   clean; `tsc --noEmit` clean both apps.
3. **No secrets committed** — ✅ realm client ships no `secret` field; only
   placeholder references in docs/.env.example.
4. **README live demo** — ✅ section with creds, one-line flow, demo-only banner,
   runbook link.

## Scope notes / deviations

- A `demo` tenant slug was **added** (not repurposing `acme`/`globex`) so the
  manifest tests that assert on `acme`/`globex` stay untouched and the Keycloak
  `tid === tenant` membership assertion passes. `DEMO_TENANT_ID=demo`.
- New app client uses `/api/auth/callback/keycloak` (these apps mount NextAuth at
  `/api/auth`), distinct from the CI `bridge-test-client`'s basePath-less path.
- `sslRequired` raised `none → external`: loopback CI roundtrip is exempt under
  the `external` policy, so `keycloak-agnosticism.yml` (uses `http://localhost`)
  stays green.
- **Parts C & D (host Keycloak + Vercel deploy)** require external infra and
  deployment secrets that can't be provisioned from this session, so they ship as
  an executable runbook (`examples/keycloak-demo/DEPLOY.md`) + Docker assets + a
  pin-secret script. The maintainer runs these and fills the `<tenant-app>` /
  `<host-shell>` realm placeholders + the README demo URL post-deploy.
- No `docs/threat-model.md` change: this task touches example-app provider config
  + docs only, not the bridge/consume routes, transferStore, cookie attributes, or
  wrapper detection.

## Deploy — DONE (live 2026-06-14)

Keycloak hosted on Railway with persistent Postgres; both apps on Vercel:
- Keycloak issuer: `https://next-auth-bridge-production.up.railway.app/realms/bridge-agnosticism`
- Host-shell: https://nab-host.vercel.app  (embeds /t/demo)
- Tenant app: https://nab-tenant.vercel.app/t/demo
- Both `/api/auth/providers` report `keycloak`; the signin POST builds a correct
  PKCE (S256) authorize redirect to the Railway realm with the real Vercel
  redirect_uri. Verified working in-browser (behaves identically to Entra).

### Bugs hit + fixed during deploy (all in realm-export.json)
1. Client `description` was ~470 chars > Keycloak's `CLIENT.DESCRIPTION` varchar(255)
   → crash-loop on Postgres import. Trimmed to 247 (`4af3f60`).
2. Placeholder `https://<tenant-app>/...` redirect URIs are rejected at import time
   ("A redirect URI is not a valid URI"). Ship only valid URIs; add real origins
   post-deploy (`7e9685b`). Also dropped the bogus `"openid"` defaultClientScope.
3. Real Vercel origins now baked into the committed client redirect/web-origins
   (`371284f`) so a fresh `--import-realm` trusts them.

### Operational notes (not code)
- `--import-realm` skips an already-existing realm → after a failed import the
  partial realm sits in Postgres; reset the volume to re-import cleanly.
- `NEXT_PUBLIC_AUTH_PROVIDER` is build-time-inlined → setting it requires a Vercel
  redeploy (clear build cache) before the provider switch takes effect.
- Grab `AUTH_KEYCLOAK_SECRET` from the **bridge-agnosticism** realm's client, not
  `master`. Wrong-realm/empty secret surfaces as Auth.js `error=Configuration`.
- A bare GET to `/api/auth/signin/keycloak` always 302s to the error page (missing
  CSRF) — NOT a misconfig. Verify with a CSRF-cookie POST or the real browser flow.

### Still open (optional, outside repo)
- Capture the evidence screenshot of the working demo.
- README demo URL is live; consider a permanent Keycloak admin (the bootstrap
  admin is temporary) if the demo is kept long-term.
