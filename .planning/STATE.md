---
gsd_state_version: 1.0
milestone: v0.2
milestone_name: milestone
status: executing
stopped_at: Phase 6 context gathered
last_updated: "2026-06-14T10:45:56.855Z"
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
**Current focus:** Phase 06 — release-engineering

## Current Position

Phase: 06
Plan: Not started
Status: Executing Phase 06
Last activity: 2026-06-14

Progress: [███████░░░] 67%

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
