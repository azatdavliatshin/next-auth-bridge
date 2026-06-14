# Hosting the public popup-bridge demo

This runbook stands up the live, no-Microsoft-account demo: a self-hosted
Keycloak as the identity provider, and both example apps on Vercel as two
distinct origins (required for the CHIPS cross-site handoff to be real).

The in-repo wiring (env-switchable provider, the `bridge-example-app` Keycloak
client) is already committed. What remains is provisioning, which needs real
infrastructure and secrets — those live in your deployment platform, never in git.

Test user (seeded in the realm, public on purpose): `bridge-test-user` /
`bridge-test-password`.

---

## Part C — host Keycloak (persistent, HTTPS)

Deploy `quay.io/keycloak/keycloak:26.0.7`. Two supported shapes:

### Option 1 — platform + Postgres (recommended; stable secret, no script)

Railway / Fly / Render with an attached Postgres. The generated client secret
persists, so you read it once and you're done.

- Build the image: `docker build -f examples/keycloak-demo/Dockerfile -t bridge-keycloak .` (build context = repo root), or point the platform at this Dockerfile.
- Command: `start --import-realm` (already the image ENTRYPOINT).
- Env:
  - `KC_BOOTSTRAP_ADMIN_USERNAME`, `KC_BOOTSTRAP_ADMIN_PASSWORD`
  - `KC_HEALTH_ENABLED=true`, `KC_HTTP_ENABLED=true`, `KC_PROXY_HEADERS=xforwarded`
  - `KC_HOSTNAME=https://<your-keycloak>`
  - Postgres: `KC_DB=postgres`, `KC_DB_URL`, `KC_DB_USERNAME`, `KC_DB_PASSWORD`
- Locally this is exactly `docker compose -f examples/keycloak-demo/docker-compose.yml up -d`.

### Option 2 — ephemeral storage + pinned secret

No database. The realm re-imports on each boot and Keycloak mints a fresh secret
each time, so pin it to a stable value after boot with
[`pin-client-secret.sh`](./pin-client-secret.sh):

```bash
KC_BASE_URL=https://<your-keycloak> \
KC_BOOTSTRAP_ADMIN_USERNAME=admin \
KC_BOOTSTRAP_ADMIN_PASSWORD=<admin-pw> \
KC_APP_CLIENT_SECRET=<the-stable-secret-you-also-put-in-vercel> \
  bash examples/keycloak-demo/pin-client-secret.sh
```

Run it as a post-deploy / release hook so the secret is re-pinned on every boot.

### Verify

```
https://<your-keycloak>/realms/bridge-agnosticism/.well-known/openid-configuration
```

must resolve. The issuer for both apps is
`https://<your-keycloak>/realms/bridge-agnosticism`.

### Read the client secret (Option 1)

Admin console → realm `bridge-agnosticism` → Clients → `bridge-example-app` →
Credentials → copy the secret. This is `AUTH_KEYCLOAK_SECRET` for Vercel.

---

## Part D — deploy both apps to Vercel (two distinct origins)

The host-shell and tenant-app **must** be different Vercel projects/origins —
two `*.vercel.app` sites are cross-site under the Public Suffix List, which is
what forces the popup-bridge + partitioned-cookie path.

1. **Provision Upstash Redis** (the transfer store). Copy `KV_REST_API_URL` /
   `KV_REST_API_TOKEN`.
2. **tenant-app** project env:
   - `NEXT_PUBLIC_AUTH_PROVIDER=keycloak`
   - `AUTH_KEYCLOAK_ID=bridge-example-app`
   - `AUTH_KEYCLOAK_SECRET=<from Part C>`
   - `AUTH_KEYCLOAK_ISSUER=https://<your-keycloak>/realms/bridge-agnosticism`
   - `AUTH_SECRET=<npx auth secret>`
   - `DEMO_TENANT_ID=demo`
   - `APP_ORIGIN`, `HOST_SHELL_ORIGIN`, `NEXT_PUBLIC_APP_ORIGIN`
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN`
3. **host-shell** project env:
   - `NEXT_PUBLIC_AUTH_PROVIDER=keycloak`
   - the same `AUTH_KEYCLOAK_ID` / `AUTH_KEYCLOAK_SECRET` / `AUTH_KEYCLOAK_ISSUER`
   - `AUTH_SECRET` (its own)
   - `APP_ORIGIN`, `NEXT_PUBLIC_APP_ORIGIN` (the tenant app's origin)
4. **Close the loop on Keycloak.** Once both Vercel URLs are known, edit the
   `bridge-example-app` client in `realm-export.json` (or the running realm) and
   replace the `<tenant-app>` / `<host-shell>` placeholders in `redirectUris` and
   `webOrigins` with the real origins:
   - `https://<tenant-app>/api/auth/callback/keycloak`
   - `https://<host-shell>/api/auth/callback/keycloak`
   Re-import / restart Keycloak so the change takes effect.
5. Confirm the bridge `allowedOrigins` are satisfied: `HOST_SHELL_ORIGIN` +
   `APP_ORIGIN` must be set on the tenant-app.

---

## Verify the live demo (clean browser profile)

1. Open the **host-shell** URL in a clean/incognito profile.
2. Sign in to the host with `bridge-test-user` / `bridge-test-password`
   (interactive Keycloak login). This establishes the top-level SSO session.
3. The embedded tenant app (`/t/demo`) renders in the cross-site iframe. Click
   **Sign in** inside it: the popup is top-level, sees the Keycloak SSO cookie,
   and completes with **no second prompt** (the `bridge-example-app` client has
   `consentRequired:false`, so no consent screen either).
4. Confirm the iframe shows **signed in**, the `tid` claim is `demo`, and
   "Matches requested tenant" is **yes**.
5. In DevTools, confirm the partitioned (CHIPS) session cookie is set inside the
   iframe and that the session persists on reload.

---

## Gotchas

- **Same realm + client on both apps.** If the host signs into a different
  realm/client than the tenant app, there is no shared SSO session and the popup
  will not be silent.
- **Top-level session first.** `/auth/bridge` only mints a handle once Auth.js
  confirms a real session — so the host sign-in must happen before the iframe
  popup runs.
- **No secret in git.** `AUTH_KEYCLOAK_SECRET` lives only in Vercel env. The
  committed realm export ships no secret.
- **Default path is unaffected.** With `NEXT_PUBLIC_AUTH_PROVIDER` unset or
  `entra`, both apps build and behave exactly as the Microsoft Entra demo did.

> **Demo only.** The Keycloak credentials are public on purpose. Never reuse this
> realm, client, or test user for anything but the throwaway demo.
