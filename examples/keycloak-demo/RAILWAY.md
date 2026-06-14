# Railway deploy walkthrough (Keycloak + Postgres)

A concrete, click-by-click version of [DEPLOY.md](./DEPLOY.md) Part C using
**Railway** to host Keycloak with a persistent Postgres. After this, follow
[DEPLOY.md](./DEPLOY.md) Part D for the two Vercel apps.

This uses the repo Dockerfile (the realm is baked in and version-controlled) and
[`railway.json`](./railway.json) (pins the Dockerfile build + healthcheck).

Prereqs: a Railway account, this repo pushed to GitHub (it is:
`azatdavliatshin/next-auth-bridge`).

---

## 1. Create the project + Postgres first

1. Railway dashboard → **New Project** → **Deploy PostgreSQL**.
   (Starting from Postgres means the DB exists before Keycloak boots.)
2. Once it provisions, click the **Postgres** service → **Variables** tab. Railway
   exposes `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` and a
   `DATABASE_URL`. You'll reference these from the Keycloak service via Railway's
   variable references in step 3.

---

## 2. Add the Keycloak service from the repo

1. In the same project → **New** → **GitHub Repo** → pick
   `azatdavliatshin/next-auth-bridge`.
2. Open the new service → **Settings**:
   - **Root Directory:** leave it as `/` (repo root). The Dockerfile COPYs
     `examples/tenant-app/keycloak/realm-export.json`, a repo-root-relative path,
     so the build context MUST be the root.
   - **Config-as-code / Railway config file:** set it to
     `examples/keycloak-demo/railway.json` (Settings → "Config File" / "Railway
     Config File" field). That file selects the Dockerfile builder and points at
     `examples/keycloak-demo/Dockerfile`.
   - If your Railway UI doesn't expose a config-file path field, instead set
     **Builder → Dockerfile** and **Dockerfile Path** = `examples/keycloak-demo/Dockerfile`
     manually; the build context stays at root.

---

## 3. Set the Keycloak service variables

Service → **Variables** → add these. For the DB ones, use Railway's
**variable references** so they track the Postgres service automatically (type
`${{` in the value field and Railway autocompletes service variables).

```
# Admin bootstrap (choose your own; these are demo-only but keep them non-trivial)
KC_BOOTSTRAP_ADMIN_USERNAME=admin
KC_BOOTSTRAP_ADMIN_PASSWORD=<a-strong-password-you-pick>

# Database — reference the Postgres service
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
KC_DB_USERNAME=${{Postgres.PGUSER}}
KC_DB_PASSWORD=${{Postgres.PGPASSWORD}}

# Proxy / hostname (Railway terminates TLS in front of the container)
KC_HTTP_ENABLED=true
KC_PROXY_HEADERS=xforwarded
KC_HOSTNAME=https://${{RAILWAY_PUBLIC_DOMAIN}}
```

Notes:
- `KC_HEALTH_ENABLED=true` is already baked into the Dockerfile; setting it again
  here is harmless.
- `${{RAILWAY_PUBLIC_DOMAIN}}` resolves to the domain Railway assigns in step 4.
  Keycloak needs `KC_HOSTNAME` to emit correct issuer/redirect URLs. If you adopt
  a custom domain later, change `KC_HOSTNAME` to that.
- Replace `Postgres` in the references with your actual Postgres service name if
  you renamed it.

---

## 4. Generate the public domain

1. Keycloak service → **Settings** → **Networking** → **Generate Domain**.
2. Railway asks which port to expose — choose **8080** (Keycloak's HTTP port).
   (Do NOT pick 9000 — that's the management/health port, not the app.)
3. You'll get something like `https://next-auth-bridge-production.up.railway.app`.
   That host is your `<your-keycloak>` everywhere below.
4. Because `KC_HOSTNAME` references `${{RAILWAY_PUBLIC_DOMAIN}}`, the service will
   redeploy and pick up the domain. If it deployed before the domain existed,
   trigger a **Redeploy** now so `KC_HOSTNAME` is correct.

---

## 5. Verify Keycloak is up

```bash
curl -fsS https://<your-keycloak>/realms/bridge-agnosticism/.well-known/openid-configuration | head -c 300
```

You should see JSON with `"issuer":"https://<your-keycloak>/realms/bridge-agnosticism"`.
If you get a 404 on the realm, the import didn't run — check the deploy logs for
`Imported realm bridge-agnosticism`. The Railway healthcheck
(`/realms/bridge-agnosticism`) also has to go green before the deploy is marked
active.

---

## 6. Read the client secret (one time)

Because Postgres persists, the generated secret is stable — read it once:

1. Open `https://<your-keycloak>/admin/` → log in with
   `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD`.
2. Top-left realm switcher → **bridge-agnosticism**.
3. **Clients** → **bridge-example-app** → **Credentials** tab → copy the
   **Client secret**. This is `AUTH_KEYCLOAK_SECRET` for both Vercel apps.

---

## 7. Hand off to Vercel (DEPLOY.md Part D)

Now do [DEPLOY.md](./DEPLOY.md) Part D with these values:

- `AUTH_KEYCLOAK_ISSUER=https://<your-keycloak>/realms/bridge-agnosticism`
- `AUTH_KEYCLOAK_ID=bridge-example-app`
- `AUTH_KEYCLOAK_SECRET=<from step 6>`
- `NEXT_PUBLIC_AUTH_PROVIDER=keycloak` (both apps)

After you know the two Vercel URLs, come back and close the loop on the realm
client's redirect/web-origins (step 8).

---

## 8. Close the loop: register the real Vercel origins

The committed realm ships only the **localhost** redirect/web-origins (Keycloak
validates redirect URIs at import time and rejects placeholder `<...>` values, so
real origins can't be baked in before they exist). Once the Vercel URLs exist,
**add** the real ones. Two ways:

**A. Admin console (fastest, but lost on a fresh DB):** Clients →
bridge-example-app → **Settings** → add to **Valid redirect URIs**:
```
https://<tenant-app>.vercel.app/api/auth/callback/keycloak
https://<host-shell>.vercel.app/api/auth/callback/keycloak
```
and to **Web origins**:
```
https://<tenant-app>.vercel.app
https://<host-shell>.vercel.app
```
Save.

**B. Commit it (survives DB resets / redeploys):** edit
`examples/tenant-app/keycloak/realm-export.json`, **append** the real origins to
the `bridge-example-app` `redirectUris` / `webOrigins` arrays (keep the localhost
entries), commit, and push. Railway rebuilds — but note: `--import-realm` only
imports a realm that does NOT already exist. With persistent Postgres the realm is
already there, so the new export won't re-import automatically. To apply it you'd
either update via the console (A) or, in the Keycloak service, run a one-off
`kc.sh import --file /opt/keycloak/data/import/realm-export.json --override true`.
For a demo, option A is fine; option B keeps git as the source of truth.

---

## Railway gotchas

- **Expose port 8080, not 9000.** The health/metrics listener lives on 9000 and
  isn't your app. The `railway.json` healthcheck targets `/realms/bridge-agnosticism`
  on the routed (8080) port for this reason.
- **`KC_HOSTNAME` must be the https Railway domain.** If issuer/redirect URLs come
  out as `http://localhost:8080`, `KC_HOSTNAME` didn't resolve — redeploy after the
  domain is generated.
- **First boot is slow.** Keycloak + realm import can take 1–3 min; the 300s
  healthcheck timeout in `railway.json` accommodates that.
- **Cost.** Keycloak idles around 300–500 MB RAM; Postgres adds a bit. Comfortably
  within Railway's small tiers for a demo, but it's not free-forever.

> **Demo only.** Public credentials, throwaway realm. Don't reuse for anything real.
