---
phase: 5
slug: multi-tenant-reference-example
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-09
validated: 2026-06-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 05-RESEARCH.md "Validation Architecture". The example IS the v0.1.0 release gate, so the
> THREAT-06 CHIPS-isolation live observation (deferred to this phase by Phase 4) is a mandatory,
> recorded manual check — not optional.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.8` (project-wide; matches `packages/core`) |
| **Config file** | none at example root yet — Wave 0 adds one (or reuses root config) |
| **Quick run command** | `pnpm --filter <example> test` (manifest + Keycloak-roundtrip units) |
| **Full suite command** | `pnpm -r test` (whole workspace incl. `packages/core`) |
| **Estimated runtime** | ~10–30 s quick; Keycloak CI job longer (container readiness poll) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter <example> test`
- **After every plan wave:** Run `pnpm -r test` (workspace stays green; `packages/core` invariants don't regress)
- **Before `/gsd-verify-work`:** Full suite green AND the manual live-preview observations recorded
- **Max feedback latency:** 30 seconds (quick suite)

---

## Per-Task Verification Map

> Per success-criterion (task IDs finalized by the planner; mapping is by requirement here).

| Requirement | Wave | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|------|------------|-----------------|-----------|-------------------|-------------|--------|
| EXAMPLE-03 | CI job | provider-agnosticism (not THREAT-05 — see note) / THREAT-06 (handle one-time-use, replay) | Real Keycloak auth-code+PKCE session → `/auth/bridge` mints handle → `/auth/consume` 302 with `Partitioned` Set-Cookie → handle one-time (replay → 4xx) | integration (dockerized Keycloak) | `pnpm --filter <example> test` in Keycloak CI job | ✅ | ✅ green |
| EXAMPLE-04 | 1 | — | Manifest route returns `Content-Type: application/manifest+json`, distinct per-tenant body, per-request (`force-dynamic`); `/install-pwa` carries the "Mode B preview — not wired" label, no service worker, no Mode B auth | unit/integration (route handler) | `pnpm --filter <example> test` | ✅ | ✅ green |
| EXAMPLE-01 | live | THREAT-06 (CHIPS partition) | Cross-site popup roundtrip signs the iframe in across ≥2 tenants | manual (live browser, cross-site) + CI roundtrip mechanics | manual DevTools procedure (below) + `pnpm --filter <example> test` | ✅ | ✅ green (live 2026-06-12, /t/acme + /t/globex) |
| EXAMPLE-02 | live | THREAT-06 | Live Vercel preview against real Entra, KV-backed roundtrip works | manual-only (live preview, real IdP) | n/a — `checkpoint:human-verify` on deployed preview | ✅ | ✅ green (live 2026-06-12, real Entra + Upstash KV) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `examples/<app>/` workspace package skeleton (package.json, tsconfig, next config) — first occupant of `examples/*` (`examples/tenant-app`)
- [x] Vitest config for the example (or reuse root) — covers EXAMPLE-03/04
- [x] `tests/manifest.test.ts` — Content-Type + per-tenant + per-request (force-dynamic) assertions (EXAMPLE-04)
- [x] `tests/keycloak-roundtrip.test.ts` + the browserless PKCE login helper (EXAMPLE-03)
- [x] `keycloak/realm-export.json` — pre-seeded realm with a PKCE-S256 client + a test user
- [x] `.github/workflows/*.yml` — Keycloak service container + readiness poll + the roundtrip test (`keycloak-agnosticism.yml`)
- [x] `.env.example` — documented placeholders (no real secrets committed)
- [x] A written manual-validation procedure doc for the live CHIPS observation (EXAMPLE-01/02 + THREAT-06) (`docs/live-validation.md`)

---

## Manual-Only Verifications

> These are the D-11 honesty boundary — the live observations the Node bench cannot make. They MUST
> be recorded (DevTools evidence) before the phase passes; they are the THREAT-06 manual-check evidence
> the threat model's honesty boundary points to.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-site popup roundtrip signs the iframe in across ≥2 tenants | EXAMPLE-01 | Needs a real browser + genuinely cross-site origins (two `*.vercel.app`) | On the live preview, open `<host-shell>.vercel.app` (cross-site-iframes `<app>.vercel.app/t/acme`); trigger popup sign-in; confirm the iframe shows signed-in for both `/t/acme` and a second tenant |
| Live preview against real Entra, KV-backed roundtrip | EXAMPLE-02 | Real multi-tenant Entra registration + provisioned Upstash store; not reproducible in CI | `checkpoint:human-verify` on the deployed preview — perform the roundtrip live; in-memory would fail by construction on serverless, so this proves the KV path |
| THREAT-06 real CHIPS partition isolation | EXAMPLE-01 / THREAT-06 | Browser-only partition enforcement; the live observation Phase 4 deferred here | DevTools → Application → Cookies: confirm the session cookie carries `Partitioned` and appears under the partition keyed to `<host-shell>` (top-level site); confirm loading the tenant app under a *different* host partition does NOT see the cookie. Record the result. |
| D-10 consume-transport observation (fetch vs navigation) | EXAMPLE-01 | The empirical CHIPS question Phase 4 left open; only meaningful because the demo is genuinely cross-site | With the fetch variant active, confirm the `Partitioned` Set-Cookie from the consume 302 commits to the iframe partition (subsequent request carries the cookie). If it does, lock fetch; if not, switch the swappable seam to navigation and re-observe. Record which transport was chosen and the evidence. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies (live/manual items explicitly flagged manual-only)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (quick suite)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Live CHIPS + transport observations recorded as THREAT-06 manual-check evidence (`docs/live-validation.md`, recorded 2026-06-12)

**Approval:** approved — Phase 5 complete; all EXAMPLE-01..04 green, Wave 0 satisfied, live CHIPS + transport evidence recorded (2026-06-12).
