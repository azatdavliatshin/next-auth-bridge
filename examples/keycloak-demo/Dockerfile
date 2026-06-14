# Hosted Keycloak for the public popup-bridge demo (Part C of the demo runbook).
#
# Bakes the committed realm (bridge-agnosticism) into the image so a stateless
# platform (Railway / Fly / Render) boots with the realm already importable. The
# image runs in production mode behind the platform's TLS proxy.
#
# Build context is the repo root so we can COPY the canonical realm export that
# the tenant-app and CI already share — one source of truth, no duplication.
#
#   docker build -f examples/keycloak-demo/Dockerfile -t bridge-keycloak .
#
FROM quay.io/keycloak/keycloak:26.0.7

# The canonical realm export, shared with examples/tenant-app and CI.
COPY examples/tenant-app/keycloak/realm-export.json /opt/keycloak/data/import/realm-export.json

# Health endpoint + HTTP listener (TLS is terminated by the platform proxy).
ENV KC_HEALTH_ENABLED=true \
    KC_HTTP_ENABLED=true \
    KC_PROXY_HEADERS=xforwarded

# start --import-realm runs production mode and imports the realm on first boot.
# KC_HOSTNAME and the bootstrap admin creds are supplied as deploy-time env vars
# (see DEPLOY.md) — never baked into the image.
ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start", "--import-realm"]
