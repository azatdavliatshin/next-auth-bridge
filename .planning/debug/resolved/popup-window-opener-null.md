---
slug: popup-window-opener-null
status: resolved
trigger: Live cross-site sign-in — the popup never closed on a cold run
created: 2026-06-11
updated: 2026-06-11
phase: "05"
---

# Debug: /auth/popup window.opener null (popup never closes)

Reconciliation record for an out-of-band live-validation debugging session. The
root cause was found and fixed empirically in a real browser against the deployed
apps (Vercel + real Entra); this file reconciles those fixes with the GSD record
and notes the one gate that remains open.

## Symptom

During Phase 5 live validation, signing in inside the embedded iframe opened the
top-level `/auth/popup` window, but the popup never closed and the iframe never
reached "signed in". The handoff stalled because `window.opener` was `null` in the
popup document, so the one-time handle had nowhere to be `postMessage`'d.

## Investigation (scientific method, empirical in a real browser)

Hypotheses tested and ELIMINATED:

- hypothesis: COOP (`Cross-Origin-Opener-Policy`) on the popup document severs the
  opener. → ELIMINATED: no COOP header present on the response.
- hypothesis: the browser/an extension drops the opener. → ELIMINATED:
  `about:blank` opened the same way keeps its opener.
- hypothesis: the `window.open` named target reuses/severs the context. →
  ELIMINATED: behavior is independent of the target name.

Discriminating observation: the `/auth/popup` DOCUMENT severs the opener, while
`/t/[tenant]` (always dynamic) does NOT. The difference is how Vercel SERVES the
document.

## Root cause

`/auth/popup` was being served as a STATICALLY PRERENDERED document from Vercel's
edge cache (`Content-Disposition: inline`, cached static asset). A browser loads
such a response into an OPENER-LESS browsing context, so `window.opener` is `null`
in the opened popup — the postMessage target is gone and the handle cannot be
delivered.

A contributing design flaw amplified it: the popup had been performing a SILENT
`prompt=none` self-navigation (to `/auth/silent` and back through Entra). A popup
that NAVIGATES ITSELF also nulls `window.opener`. So even with dynamic serving, the
self-redirect model could not keep the opener alive.

## Fix (committed directly on `dev`, outside plan-execute)

- `3125d8e` — `app/auth/layout.tsx`: `export const dynamic = "force-dynamic"` for
  all `/auth/*`. Vercel now serves `/auth/popup` as a per-request document (no
  `Content-Disposition`, no static cache), so the popup keeps its opener. Confirmed
  in the build: `/auth/popup` is `ƒ (Dynamic)`.
- `7b0ebb4` — popup is now SESSION-FIRST and NEVER navigates itself: it reads the
  existing session, `postMessage`s the handle to the captured opener, and
  self-closes. The silent `prompt=none` self-redirect model is reverted entirely.
- `5498122` — warm/not-warm is decided via `/api/auth/session` (a side-effect-free
  read), NOT a `/auth/bridge` probe. The bridge MINTS a one-time handle on every
  authenticated GET, so probing it for status orphaned a code in the store on every
  check; `runPopupFlow` now hits `/auth/bridge` exactly once for the handle actually
  delivered.

## Reconciliation of superseded records

The `silent prompt=none` approach is REVERTED. These earlier commits no longer
describe the code and are superseded by the session-first model above:

- `3ef17d5` feat: silent prompt=none popup auth
- `fe00c66` docs(quick): host-SSO + silent-popup quick task
- `4e22a04` docs(quick): warm-popup rework quick task

Cleanup applied in this reconciliation pass:

- Removed the dead `examples/tenant-app/app/auth/silent/` route (no importers once
  the popup stopped self-navigating): `page.tsx` + `auto-submit.tsx`.
- Removed the temporary `console.log` tracing from `f63ba14` across
  `app/auth/popup/page.tsx`, `app/auth/sign-in-launcher.tsx`,
  `lib/consume-transport.ts` (the silent page that also carried logs was deleted).
- Updated the `force-dynamic` layout comment to drop the `/auth/silent` reference.

Note: the model is now exactly the one Phase 5 set out to demonstrate — popup is
warm-only, reads an existing host-established session, postMessages the handle, and
self-closes; it NEVER navigates itself.

## Verification

- `pnpm -r test`: green — `packages/core` 105/105, `tenant-app` 5 passed / 2
  skipped, `host-shell` clean.
- `next build` (tenant-app): succeeds; `/auth/popup` is `ƒ (Dynamic)`; no
  `/auth/silent` route remains.
- No `console.log` / `nab …` trace markers and no `auth/silent` references remain in
  committed `examples/` or `packages/` source.

## GATE CLOSED — live validation passed (2026-06-12)

Re-verified end-to-end in a real browser (Chrome, Incognito) against the deployed
apps (`nab-host.vercel.app` embedding `nab-tenant.vercel.app`), real multi-tenant
Entra, Upstash-KV-backed store:

- The `force-dynamic` fix holds: the warm popup completes the handoff — it reads
  the existing session, posts the one-time handle to its opener, and self-closes,
  with no interactive Entra login page. `window.opener` survived (had it still been
  null the handle could not have been delivered and the iframe would never have
  signed in).
- Confirmed for ≥2 tenants: `/t/acme` (the embedded cross-site + CHIPS capture) and
  `/t/globex` both reached signed-in.
- CHIPS partition enforcement confirmed in DevTools: under the `nab-host` top-level
  partition the tenant's `__Secure-authjs.session-token` shows `Partitioned;
  SameSite=None; Secure; HttpOnly; Path=/` with partition key = `nab-host` and
  Cross-site ✓; under the tenant app's OWN top level (`nab-tenant.vercel.app/t/acme`)
  that partitioned row is absent (only the first-party `Lax` cookie). This closes
  the D-11 honesty boundary in `docs/threat-model.md` (real partition enforcement is
  browser-only) AND empirically resolves the deferred fetch-vs-navigation transport
  question — the credentialed `fetch` in `redeemHandle` committed the partitioned
  cookie.

Recorded in `examples/tenant-app/docs/live-validation.md` (procedure + evidence) and
summarized in `.planning/phases/05-multi-tenant-reference-example/05-05-SUMMARY.md`.

Not separately captured: the `GET /auth/popup` network status (200 vs. 307/308). The
successful handoff (opener survived, handle delivered, iframe signed in) implies the
opener was not severed, so the direct network-status check was not needed to close
the gate; note it for a future run if the popup ever regresses.
