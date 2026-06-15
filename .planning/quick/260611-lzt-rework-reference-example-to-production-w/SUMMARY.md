---
quick_id: 260611-lzt
slug: rework-reference-example-to-production-w
date: 2026-06-11
status: complete
---

# Quick Task Summary: Production warm-popup rework

Reshaped the reference example to model the production warm-popup flow and reverted
the cold-start package additions (interactive signIn-in-popup + BroadcastChannel)
that modeled a non-existent problem.

## Commits

- `ca6bc09` revert(popup): drop BroadcastChannel handback — models a non-existent problem
- `e787712` feat(05-05): model the production warm-popup flow in the reference example

## What changed

**Package (`packages/core`) — reverted the cold-path additions:**
- `popup-flow.ts`: removed the `broadcast` dep; `runPopupFlow` delivers via
  `opener.postMessage` only (the original THREAT-03 boundary).
- `open-auth-popup.ts`: removed `addBroadcastListener` and the broadcast listener.
  Kept the opt-in close-poll and the best-effort `popupWin.close()` on settle.
- `docs/threat-model.md`: THREAT-03 restored to the postMessage-only boundary.
- Trimmed the BroadcastChannel tests + helpers. Core suite 111 → 105, still green.

**Example (`examples/tenant-app`) — warm-popup model:**
- `app/auth/popup/page.tsx`: warm-only. With an opener + existing top-level session
  it fetches the bridge, postMessages the handle, and self-closes. No interactive
  signIn, no BroadcastChannel. No opener → in-iframe launcher; opener-but-not-warm →
  a clear "establish the session first" message linking to the SSO step.
- `app/auth/sign-in-launcher.tsx`: dropped the BroadcastChannel listener and the
  long interactive-signIn timeout (warm popup posts back near-instantly).
- `app/auth/establish-sso/page.tsx` (new): top-level Auth.js sign-in standing in for
  enterprise SSO, warming the session before the embedded view is used.
- `lib/consume-transport.ts`: locked to fetch as the resolved transport; the
  navigation helper kept only as a reference.

## Verification

- `pnpm -r test`: green — `packages/core` 105/105, `tenant-app` 5 passed / 2 skipped,
  `host-shell` clean.
- `tsc --noEmit`: 0 errors across all three packages.
- `next build` (tenant-app): succeeds; `/auth/establish-sso` and `/auth/popup` routes
  present. (The pre-existing Edge `crypto` warning from the middleware barrel is
  unrelated and already flagged separately.)
- No `BroadcastChannel` / `addBroadcastListener` in any `examples/` or `packages/`
  source; popup page has no `signIn` import (warm-only). No internal req-IDs in the
  committed example source.

## Acceptance — met

- [x] Bridge popup is warm-only: reads session, fetches bridge, postMessages code,
      self-closes; no interactive signIn and no BroadcastChannel remain.
- [x] `consume-transport.ts` locked to fetch (resolved).
- [x] `docs/threat-model.md` THREAT-03 back to the postMessage-only boundary.
- [x] `pnpm -r test` green.
- [ ] Live re-validation (redeploy nab-tenant; warm precondition → one-pass sign-in
      across ≥2 tenants) — requires the operator; deferred to the live check.

## Notes for live re-validation

The operator should: (1) open the tenant app top level and complete
`/auth/establish-sso` (stands in for host SSO), (2) open the host-shell embed and
click sign-in — the popup should be warm, post the code, and self-close, and the
iframe should show signed in for `/t/acme` and `/t/globex`.
