---
slug: keycloak-ci-docker-run
created: 2026-06-14
mode: quick
---

# Fix keycloak-agnosticism CI workflow

The `.github/workflows/keycloak-agnosticism.yml` workflow fails on every run: the
Keycloak readiness poll on `:9000/health/ready` always times out.

## Root cause

Keycloak runs as a `services:` container. Service containers cannot take a startup
command/arg, but `quay.io/keycloak/keycloak`'s entrypoint (`kc.sh`) has no default
command — without `start`/`start-dev` it prints help and exits, never binding
8080/9000. The image is also ubi9-micro (no bash), so the `--health-cmd`
`/dev/tcp` shell trick can't run. The REST-API "Import realm" step is a workaround
for the same constraint.

## Fix

- Remove the `services.keycloak` block.
- Remove the "Import realm" REST-API step.
- Add a "Start Keycloak" step (before readiness poll) running Keycloak via
  `docker run -d` with `start-dev --import-realm`, mounting the committed realm
  export into `/opt/keycloak/data/import`.
- Keep the readiness poll on `:9000/health/ready`; on timeout dump
  `docker logs keycloak` before `exit 1`.
- Add a final `if: failure()` step running `docker logs keycloak || true`.
- Leave job-level `KEYCLOAK_*` env, pnpm/Node setup, the build, and the test
  step unchanged.

## Verified facts

- `examples/tenant-app/package.json` `name` is `tenant-app-example` — the
  `pnpm --filter tenant-app-example test` filter is already correct. No change.

## Do NOT touch

- `examples/tenant-app/keycloak/realm-export.json`
- `examples/tenant-app/tests/lib/keycloak-pkce-login.ts`

## Acceptance

- Workflow reaches and passes "Run Keycloak roundtrip test" on dev.
- pnpm filter matches the package name (confirmed).
- A forced Keycloak failure surfaces `docker logs keycloak` output.
