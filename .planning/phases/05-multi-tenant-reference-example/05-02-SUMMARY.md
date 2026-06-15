---
phase: 05-multi-tenant-reference-example
plan: 02
subsystem: example
tags: [next, app-router, pwa, web-app-manifest, vitest, force-dynamic]

# Dependency graph
requires:
  - phase: 05-01
    provides: examples/tenant-app workspace package (resolvable, App Router app)
provides:
  - examples/tenant-app/app/t/[tenant]/manifest.webmanifest/route.ts — dynamic per-tenant application/manifest+json route (force-dynamic)
  - examples/tenant-app/app/install-pwa/page.tsx — inert "Mode B preview — not wired" install entry point
  - examples/tenant-app/vitest.config.ts — example-local Vitest config (node env, @/* alias, tests/** include)
  - examples/tenant-app/tests/manifest.test.ts — media-type + per-tenant + force-dynamic negative-case suite
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route handler returns a raw `new Response(JSON.stringify(body), { headers: { Content-Type: application/manifest+json } })` — never NextResponse.json (which emits application/json)"
    - "`export const dynamic = \"force-dynamic\"` defeats App Router caching so per-tenant manifests are computed per request"
    - "Next 16 async route params: `params: Promise<{ tenant: string }>` awaited before use"
    - "Example-local vitest config mirrors the tsconfig `@/*` alias via resolve.alias so tests import routes the same way app code does"
    - "Inert PWA scaffold: server component, no service worker, no auth-surface import — an unambiguous visible label is the only safety boundary needed"

key-files:
  created:
    - examples/tenant-app/vitest.config.ts
    - examples/tenant-app/app/t/[tenant]/manifest.webmanifest/route.ts
    - examples/tenant-app/tests/manifest.test.ts
    - examples/tenant-app/app/install-pwa/page.tsx
  modified: []

key-decisions:
  - "vitest.config.ts adds a resolve.alias for `@` (mirroring the tsconfig path alias) so the manifest test can import the route via `@/app/...` — required because the default vitest run does not honor tsconfig paths"
  - "Demo tenants fixed as acme + globex (matching the manifest test fixtures) so the install-pwa page links concrete, testable manifest routes"
  - "icons reference per-tenant /t/<tenant>/icon-*.png paths (manifest shape only; the PNG assets themselves are out of scope for this inert v0.2 scaffold)"

requirements-completed: [EXAMPLE-04]

# Metrics
duration: 5min
completed: 2026-06-09
---

# Phase 5 Plan 2: Inert PWA Scaffolding (Dynamic Manifest + install-pwa) Summary

**A dynamic per-tenant manifest route that emits per-request `application/manifest+json` (force-dynamic, raw Response — never NextResponse.json), an inert "Mode B preview — not wired" /install-pwa page with no service worker and no auth wiring, plus an example-local Vitest config and a negative-case manifest suite (media-type, per-tenant body, per-tenant-distinct, force-dynamic) — all green on the Node bench.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-06-09
- **Tasks:** 2
- **Files created:** 4 (no modifications to existing source)

## Accomplishments

- **Dynamic per-tenant manifest route** (`app/t/[tenant]/manifest.webmanifest/route.ts`): `export const dynamic = "force-dynamic"` + an async `GET(_req, { params })` (Next 16 `Promise<{ tenant }>` params) that builds a per-tenant manifest (`name`/`short_name`/`start_url: /t/<tenant>`/`scope: /t/<tenant>`/`display: standalone`/per-tenant `icons`) and returns it as a raw `new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json" } })`. `NextResponse.json()` is deliberately NOT used (it would emit `application/json` and fail the media-type constraint).
- **Example-local Vitest config** (`vitest.config.ts`): node environment, `tests/**/*.test.ts` include, and a `resolve.alias` for `@` mirroring the tsconfig path alias so the test imports the route exactly as app code does.
- **Manifest negative-case suite** (`tests/manifest.test.ts`): asserts (1) `Content-Type === application/manifest+json` (a regression to `application/json` fails), (2) the parsed body reflects the tenant in `name`/`start_url`/`scope`, (3) two distinct tenants (`acme`, `globex`) return DIFFERENT bodies (per-tenant regression guard), (4) the module exports `dynamic === "force-dynamic"`. Drives the exported `GET` directly with a plain `Request` and a synthesized `{ params: Promise.resolve({ tenant }) }` — no Next.js runtime, mirroring the `packages/core` describe/it/expect discipline.
- **Inert install-pwa page** (`app/install-pwa/page.tsx`): a clean-minimal server component carrying the unambiguous visible label **"Mode B preview — not wired"**, inline self-documenting copy explaining it is v0.2 installation scaffolding, and links to each demo tenant's manifest. Registers NO service worker, wires NO Mode B / native auth, imports nothing from the bridge auth surface.

## Task Commits

1. **Task 1: Dynamic per-tenant manifest route + Vitest config + manifest test** (TDD) - `11e7eb5` (feat)
2. **Task 2: Inert, labeled /install-pwa "Mode B preview" page** - `90f5bb0` (feat)

## Files Created

- `examples/tenant-app/vitest.config.ts` - Example-local Vitest config (node env, `@/*` alias, `tests/**` include)
- `examples/tenant-app/app/t/[tenant]/manifest.webmanifest/route.ts` - `force-dynamic` GET emitting per-request per-tenant `application/manifest+json`
- `examples/tenant-app/tests/manifest.test.ts` - Media-type + per-tenant + per-tenant-distinct + force-dynamic suite
- `examples/tenant-app/app/install-pwa/page.tsx` - Inert "Mode B preview — not wired" install entry point

## TDD Gate Compliance

Task 1 followed RED → GREEN: the manifest test was written first and failed (`Cannot find package '@/app/t/[tenant]/manifest.webmanifest/route'`) before the route existed; after adding the alias resolution and the route it passed 4/4. Both RED and GREEN landed in a single `feat` commit (`11e7eb5`) since the test file and its target are co-introduced scaffolding for a new example; no separate `test(...)` commit was made. The negative guards (wrong-media-type, identical-manifest) are present and asserting.

## Decisions Made

- **`resolve.alias` in vitest.config.ts:** A plain `vitest run` does not honor tsconfig `paths`, so the test's `@/app/...` import was unresolved on first run. Added `resolve.alias["@"] = <example root>` (via `fileURLToPath(new URL(".", import.meta.url))`) so tests and app code import via the same alias. This is the minimal, idiomatic vitest mechanism.
- **Demo tenants `acme` + `globex`:** chosen to match the manifest test fixtures and give the install-pwa page two concrete, testable manifest links.
- **Per-tenant `icons` paths** reference `/t/<tenant>/icon-{192,512}.png` — manifest shape only; the icon PNG assets are out of scope for this inert v0.2 scaffold (noted as a known, intentional non-stub: the manifest is valid JSON; serving the icon binaries is a later concern, not required by EXAMPLE-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a `resolve.alias` to the Vitest config for `@/*` resolution**
- **Found during:** Task 1 (RED → first GREEN attempt)
- **Issue:** The plan specifies the test imports the route handler, and the tsconfig uses an `@/*` alias, but a bare `vitest run` does not read tsconfig `paths`, so `@/app/...` could not resolve and the suite errored at import (distinct from the intended RED, which is "route module missing").
- **Fix:** Added `resolve.alias["@"]` to `vitest.config.ts` mapping `@` to the example root. Aligns the test's import path with the app's. No production-source change.
- **Files modified:** `examples/tenant-app/vitest.config.ts`
- **Verification:** `pnpm --filter tenant-app-example test` → 4/4 passing.
- **Committed in:** `11e7eb5` (Task 1 commit)

### Environment Prerequisites (not source changes)

**2. [Rule 3 - Blocking] `pnpm install` + `pnpm --filter next-auth-bridge build` in the fresh worktree**
- **Found during:** Task 1 verification (vitest binary missing) and Task 2 verification (example typecheck)
- **Issue:** The worktree was checked out without `node_modules`, and (as the Wave 1 SUMMARY flagged) the package `dist/` must exist for the example to typecheck because the example consumes the published `exports` map, not `src/`.
- **Fix:** Ran `pnpm install --frozen-lockfile` (lockfile already up to date — no resolution, no lockfile change) and `pnpm --filter next-auth-bridge build` (tsup emits the gitignored `dist/`). Both are environment materialization, not source changes.
- **Files modified:** none committed (`pnpm-lock.yaml` unchanged; `dist/` stays gitignored)
- **Verification:** vitest runs; `tsc --noEmit -p tsconfig.json` over the example is clean (zero `error TS`).
- **Committed in:** n/a (no source change)

---

**Total deviations:** 1 source auto-fix (Rule 3 — vitest alias) + 1 environment prerequisite (install + dist build). No scope creep; no change to the package's security-critical surface.

## Verification Results

- `pnpm --filter tenant-app-example test` → **4/4 passing** (media-type, per-tenant body, per-tenant-distinct, force-dynamic).
- `pnpm -r test` → **packages/core 98/98** + **tenant-app 4/4** — no regression.
- `tsc --noEmit -p tsconfig.json` over the example → **clean** (zero `error TS`).
- No-internal-ID greps over `examples/tenant-app/app/t`, `tests/manifest.test.ts`, `vitest.config.ts`, and `app/install-pwa/page.tsx` → **clean**.
- install-pwa content checks → contains `Mode B preview` + `not wired`; NO `serviceWorker`/`service-worker`/`navigator.serviceWorker`; imports nothing from the bridge auth surface.

## Threat Surface Notes

This plan's surface matches the plan `<threat_model>` exactly and does NOT touch the bridge/consume routes, transferStore behavior, cookie-attribute setting, or wrapper-detection logic — the CLAUDE.md threat-model-discipline trigger is not tripped.

- **T-05-05 (manifest media type — mitigate):** raw `Response` with explicit `application/manifest+json`; the test asserts the exact media type and rejects a regression to `application/json`. No secrets in the manifest body.
- **T-05-06 (reflected `tenant` segment — accept):** the segment is reflected only into a manifest `name`/`start_url`/`scope` (same-origin path), never into HTML/script or a cross-origin URL — no XSS/redirect surface.
- **T-05-07 (/install-pwa inertness — mitigate):** no service worker registered, no Mode B auth wired (grep-verified); the page cannot establish any native auth state.

No new security-relevant surface beyond the plan's threat model.

## Known Stubs

- The per-tenant manifest `icons` reference `/t/<tenant>/icon-192.png` and `/t/<tenant>/icon-512.png`, for which no PNG assets are served in this plan. This is intentional and within EXAMPLE-04 scope: the requirement is a valid per-request `application/manifest+json` body with per-tenant shape (verified), not shipped icon binaries. Serving the icon assets is a later concern; it does not block the manifest's correctness or the install-pwa scaffold's purpose.

## Next Phase Readiness

- The inert PWA scaffolding (EXAMPLE-04) is complete and CI-green on the Node bench — the most CI-testable Phase 5 requirement. Plans 03–05 (cross-site consume seam, Keycloak CI proof, live Vercel deploy) build on the unchanged scaffold.
- Reminder for downstream / fresh checkouts: run `pnpm install` and `pnpm --filter next-auth-bridge build` before the example typechecks or its vitest binary resolves (the example consumes the package `exports` map, so `dist/` must exist).

## Self-Check: PASSED

All 4 created files verified present on disk; both task commits (`11e7eb5`, `90f5bb0`) verified in the git log.

---
*Phase: 05-multi-tenant-reference-example*
*Completed: 2026-06-09*
