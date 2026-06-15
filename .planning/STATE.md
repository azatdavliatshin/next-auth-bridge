---
gsd_state_version: 1.0
milestone: none
milestone_name: (v0.1.0 archived — next set by /gsd-new-milestone)
status: milestone_complete
stopped_at: v0.1.0 published + milestone archived; no active milestone
last_updated: "2026-06-14T14:10:00.000Z"
last_activity: 2026-06-14
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 21
  completed_plans: 21
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-05)

**Core value:** The popup-bridge (Mode A) pattern works end-to-end and is deeply correct — every threat-model invariant holds under negative-case test coverage.
**Current focus:** Shipped — `next-auth-bridge@0.1.0` published to npm.

## Current Position

Phase: 06 (complete)
Status: RELEASED — v0.1.0 live on npm (with provenance), v0.1.0 tag + GitHub Release, CHANGELOG on main. dev synced with main.
Last activity: 2026-06-14

Progress: [██████████] 100%

## Release

- **v0.1.0** published to npm 2026-06-14: https://www.npmjs.com/package/next-auth-bridge — SLSA provenance attestation, tarball ships dist (index/store-kv/middleware) + LICENSE + README.
- First publish required a multi-step CI bootstrap (documented below); future releases are fully automated via semantic-release from the `v0.1.0` baseline.
- `main` is governed by a repository **ruleset** (PR-only + `pr-title / validate` required check, owner/admin bypass so `@semantic-release/git` can push the CHANGELOG re-commit). Classic branch protection was replaced by the ruleset because a personal repo cannot add the Actions bot as a bypass actor.
- Bootstrap lessons (for the next milestone / OIDC switch): tsdown needs `unrun` devDep on clean installs; `NODE_AUTH_TOKEN` must carry the npm token (setup-node .npmrc shadows it); npm 2FA requires an **Automation** token in CI (others trigger EOTP); semantic-release defaults the first release to 1.0.0 unless a `v0.0.0` baseline tag exists (we used one to get 0.1.0).

## Post-release follow-ups (deferred, tracked in 06-HUMAN-UAT.md)

- Switch npm publishing to **OIDC Trusted Publishing** now the package exists (Phase B) — lets you delete `NPM_TOKEN`/`NODE_AUTH_TOKEN`. OIDC will work now (the prior 404 "package not found" is resolved).
- Open the **authjs.dev** cross-context bridge recipe PR (RELEASE-05) — source in docs/recipes/.

## Performance Metrics

**Velocity:**

- Total plans completed: 17
- Average duration: ~5 min
- Total execution time: ~0.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. TransferStore & Adapters | 3 | ~19 min | ~6 min |
| 02 | 3 | - | - |
| 03 | 4 | - | - |
| 06 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: 01-01, 01-02, 01-03 (all green)
- Trend: Phase 1 complete; Wave 2 ran 01-02 + 01-03 in parallel worktrees

*Updated after each plan completion*
| Phase 01-transferstore-adapters P01 | 6 min | 3 tasks | 11 files |
| Phase 01-transferstore-adapters P02 | ~5 min | 2 tasks | 3 files |
| Phase 01-transferstore-adapters P03 | ~7 min | 2 tasks | 2 files |
| Phase 02-bridge-consume-routes P01 | 4min | 3 tasks | 9 files |
| Phase 02-bridge-consume-routes P02 | ~3min | 2 tasks | 2 files |
| Phase 02-bridge-consume-routes P03 | ~3min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Foundation-first / Horizontal Layers, 6 phases — transferStore interface is the highest-leverage decision, designed once against two real adapters (in-memory + Vercel KV).
- [Roadmap]: Security tests colocated to the layer that produces them — each phase ships with its mapped negative-case coverage, not deferred.
- [Roadmap]: First working flow lands on the Vitest test bench in Phase 3; deployable Vercel preview lands in Phase 5.
- [Phase 01-transferstore-adapters]: Resolvable pnpm filter is 'next-auth-bridge' (not @next-auth-bridge/core); TransferPayload locked to { authCookieValue }; ttlSeconds>60 throws at construction
- [Phase ?]: [Phase 02-bridge-consume-routes]: harvestSessionChunks lives in cookie-codec.ts (Wave 2 imports it); TransferPayload finalized as bare Array<{name,value}> (D-01); auth-helpers stay separately importable, index.ts barrel deferred to the factory wave (D-11)
- [Phase 02-bridge-consume-routes]: createBridgeHandler(options) => (request) => Promise<Response> shipped (D-06); gate order Origin->verifySession->harvest->empty-harvest-guard->mint->200{code}; Origin-disallowed=403, empty-harvest=500 (concrete picks inside the 4xx/5xx bands, tests assert the band); docs/threat-model.md creation deferred to Phase 4 (does not yet exist; THREAT-NN traceability delivered via tagged tests)
- [Phase 02-bridge-consume-routes]: createConsumeHandler(options) shipped (ROUTE-03); consume bad-handle=400 (401 reserved for bridge no-session, 5xx for store throw — three failure modes separable); factored writeChunkCookies(headers, payload, {maxAge}) takes the attribute set as input so the v0.2 PWA cookie path is additive (D-13); createAuthBridge(options) => { bridge, consume } is the single wiring point (D-10), helpers stay off the return (D-11); index.ts re-exports createAuthBridge + helpers + AuthBridgeOptions/VerifySession, KV stays subpath-only

### Pending Todos

- [Phase 6] Migrate build tooling tsup → tsdown. tsup is no longer actively maintained (README directs users to tsdown, the Rolldown-team successor; latest tsup release 8.5.1, Nov 2025). tsdown is "compatible with tsup's main options" with a migration guide but still pre-1.0 (~v0.22.x as of 2026-06). Defer to Phase 6 (Release Engineering) where the publish pipeline is built and tsdown is more likely ≥1.0. Scope is isolated: `packages/core/tsup.config.ts` (2 entries, esm, dts, clean), the `build` script, and the devDep. Re-verify `dist/index.js` + `dist/store/kv.{js,d.ts}` emit and the subpath export resolves after swapping.

### Blockers/Concerns

- Build tool `tsup` is unmaintained (not a blocker — still functional). Tracked as a Phase 6 todo above; no Phase 1 impact (bundler is build-time only, no effect on runtime security correctness).

## Quick Tasks Completed

| Date | Task | Status |
|------|------|--------|
| 2026-06-11 | Rework reference example to the production warm-popup model (drop cold-start interactive bootstrap + BroadcastChannel; lock consume transport to fetch) | complete ✓ |
| 2026-06-11 | Model the production warm-popup flow: authenticate the host against the shared Entra registration; bridge popup mints the tenant session via a silent prompt=none auth (drop the establish-sso stand-in) | complete ✓ |
| 2026-06-14 | Pre-publish doc fixes: rewrite the README Quick Start to the real public API + fix dead links (B4); close the THREAT-06 honesty boundary against the 2026-06-12 live CHIPS validation (B5) | complete ✓ |
| 2026-06-14 | Prepack LICENSE + README into the packages/core tarball (CR-02) — copy script on prepack so the published package ships its license and readme | complete ✓ |
| 2026-06-14 | Investigate + prepare npm Trusted Publishing (OIDC): documented two-phase rollout (token bootstrap -> OIDC) in release-governance; bumped release.yml Node to 22.14 / setup-node@v6; tracked the post-first-publish token-removal switch | complete ✓ |
| 2026-06-14 | Apply branch protection on main (RELEASE-04): repo made public (Free plan can't protect private repos), protection applied via gh api (PR-only, PR-Title check required, enforce_admins=false for the release CHANGELOG re-commit); fixed the broken -f recipe in release-governance to a JSON --input body + Free/public caveat | complete ✓ |
| 2026-06-14 | Fix keycloak-agnosticism CI: replace the broken `services:` Keycloak (no startup command, ubi9-micro health-cmd can't run) + REST-API realm import with a plain `docker run start-dev --import-realm`; dump `docker logs keycloak` on readiness timeout and add an `if: failure()` log step | complete ✓ |
| 2026-06-14 | Phase 1a public Keycloak demo: make both example apps' Auth.js provider env-switchable (Entra default \| Keycloak via NEXT_PUBLIC_AUTH_PROVIDER), add confidential `bridge-example-app` realm client + sslRequired:external (no committed secret), collapse Keycloak users onto a fixed `demo` tenant, scaffold host-Keycloak + Vercel deploy as `examples/keycloak-demo/` runbook, README Live demo section. In-repo work shipped + verified (tests/builds green both modes); deploy (Parts C/D) + screenshot left to maintainer | complete ✓ |
| 2026-06-15 | Cold-start case (a): replace the top-level `/auth/popup` not-warm dead-end with a ONE-SHOT silent `prompt=none` re-auth (loop-guarded by `?silent=attempted`/`?error`), then the existing handle delivery; `pages.error -> /auth/popup` routes a `login_required` failure to the popup's own notice. Example-app only (chore scope, no published-version bump); packages/core, middleware, threat-model untouched. Probe spike branch + remote deleted; Vercel preview de-aliased by branch deletion (CLI unauth'd — full record removal left to maintainer). Build + tsc + tenant-app tests green | complete ✓ |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-06-12T15:16:06.410Z
Stopped at: Phase 6 context gathered
Resume file: .planning/phases/06-release-engineering/06-CONTEXT.md
Next: Phase 4 complete — proceed to Phase 5 (multi-tenant Entra reference app on Vercel preview, KV adapter — EXAMPLE-*)
