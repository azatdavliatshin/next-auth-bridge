---
slug: keycloak-ci-docker-run
created: 2026-06-14
status: complete
---

# Summary — Fix keycloak-agnosticism CI workflow

## What changed

`.github/workflows/keycloak-agnosticism.yml`:

- Removed the `services.keycloak` container block (and its impossible
  `/dev/tcp` `--health-cmd`).
- Removed the "Import realm" admin-REST-API workaround step.
- Added a **Start Keycloak** step running the image via `docker run -d` with
  `start-dev --import-realm`, mounting `examples/tenant-app/keycloak` into
  `/opt/keycloak/data/import:ro`. This gives the entrypoint the startup command
  a service block can't, and imports the committed realm at boot.
- Readiness poll on `:9000/health/ready` retained; on timeout it now dumps
  `docker logs keycloak` before `exit 1`.
- Added a trailing `if: failure()` step running `docker logs keycloak || true`.
- Left job-level `KEYCLOAK_*` env, pnpm/Node setup, the
  `pnpm --filter next-auth-bridge build`, and
  `pnpm --filter tenant-app-example test` steps unchanged.

## Verified

- `examples/tenant-app/package.json` `name` = `tenant-app-example` → the
  `pnpm --filter tenant-app-example test` filter was already correct; no change.
- `examples/tenant-app/keycloak/` contains only `realm-export.json`, so mounting
  the whole dir as the import directory is safe.
- YAML parses (`yaml.safe_load`).
- Did not touch `realm-export.json` or `keycloak-pkce-login.ts`.

## Not verifiable locally

The actual CI run ("Run Keycloak roundtrip test" passing on dev) can only be
confirmed once the workflow runs on push. The fix addresses the documented
root cause; observe the next run on dev to confirm green.
