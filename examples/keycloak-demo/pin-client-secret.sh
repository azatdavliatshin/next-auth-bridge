#!/usr/bin/env bash
# Pin the bridge-example-app client secret to a known value (Part B).
#
# WHY: with ephemeral Keycloak storage the realm is re-imported on every boot and
# Keycloak generates a fresh client secret each time — which would invalidate the
# AUTH_KEYCLOAK_SECRET already set in Vercel. This post-import admin-API step sets
# the secret to a stable value you control (KC_APP_CLIENT_SECRET), so it survives
# restarts without a database. Skip this entirely if you attached Postgres/a
# volume (docker-compose.yml) — there the generated secret already persists.
#
# Run it once after each boot (e.g. as a release/post-deploy hook), or bake it
# into the container start command after Keycloak reports ready.
#
# Required env:
#   KC_BASE_URL              e.g. https://your-keycloak.example.com
#   KC_BOOTSTRAP_ADMIN_USERNAME / KC_BOOTSTRAP_ADMIN_PASSWORD
#   KC_APP_CLIENT_SECRET     the stable secret to pin (also set as AUTH_KEYCLOAK_SECRET in Vercel)
#
# Optional env:
#   KC_REALM                 default: bridge-agnosticism
#   KC_APP_CLIENT_ID         default: bridge-example-app
set -euo pipefail

KC_REALM="${KC_REALM:-bridge-agnosticism}"
KC_APP_CLIENT_ID="${KC_APP_CLIENT_ID:-bridge-example-app}"

: "${KC_BASE_URL:?set KC_BASE_URL}"
: "${KC_BOOTSTRAP_ADMIN_USERNAME:?set KC_BOOTSTRAP_ADMIN_USERNAME}"
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set KC_BOOTSTRAP_ADMIN_PASSWORD}"
: "${KC_APP_CLIENT_SECRET:?set KC_APP_CLIENT_SECRET}"

echo "Acquiring admin token from ${KC_BASE_URL} ..."
ADMIN_TOKEN=$(curl -fsS \
  -d "client_id=admin-cli" \
  -d "username=${KC_BOOTSTRAP_ADMIN_USERNAME}" \
  -d "password=${KC_BOOTSTRAP_ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  "${KC_BASE_URL}/realms/master/protocol/openid-connect/token" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "${ADMIN_TOKEN}" ]; then
  echo "ERROR: could not obtain admin token (check base URL / admin creds)." >&2
  exit 1
fi

echo "Resolving internal id of client '${KC_APP_CLIENT_ID}' ..."
CLIENT_UUID=$(curl -fsS \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "${KC_BASE_URL}/admin/realms/${KC_REALM}/clients?clientId=${KC_APP_CLIENT_ID}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)

if [ -z "${CLIENT_UUID}" ]; then
  echo "ERROR: client '${KC_APP_CLIENT_ID}' not found in realm '${KC_REALM}'." >&2
  exit 1
fi

echo "Pinning client secret ..."
curl -fsS -X PUT \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"${KC_APP_CLIENT_SECRET}\"}" \
  "${KC_BASE_URL}/admin/realms/${KC_REALM}/clients/${CLIENT_UUID}" >/dev/null

echo "Done. ${KC_APP_CLIENT_ID} secret pinned. Set the SAME value as AUTH_KEYCLOAK_SECRET in both Vercel projects."
