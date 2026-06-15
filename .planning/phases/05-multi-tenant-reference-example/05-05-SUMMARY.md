---
phase: 05-multi-tenant-reference-example
plan: 05
subsystem: validation
tags: [live-validation, chips, partitioned-cookie, cross-site, entra, popup-bridge, window-opener, threat-06]

# Dependency graph
requires:
  - phase: 05-02
    provides: createAuthBridge ({ bridge, consume }) — the live bridge/consume routes
  - phase: 05-03
    provides: client helpers + popup/launcher + context middleware
  - phase: 05-04
    provides: pre-deploy bench (pnpm -r test) the live run is gated behind
provides:
  - Recorded browser-only proof of the cross-site popup-bridge sign-in (>=2 tenants)
  - Recorded CHIPS partition-enforcement evidence closing the D-11 honesty boundary
  - Empirical resolution of the deferred fetch-vs-navigation consume-transport question
affects: []

key-files:
  modified:
    - examples/tenant-app/docs/live-validation.md  # procedure + recorded live evidence (2026-06-12)
    - .planning/debug/resolved/popup-window-opener-null.md  # gate marked closed
---

# 05-05 Summary: live cross-site validation (gate closed)

The one thing the Node bench cannot observe — that the popup bridge signs an iframe
in across a genuinely cross-site boundary, and that the session cookie is CHIPS-
partitioned and isolated to the embedding host's partition — was verified live in a
real browser and recorded. This closes Phase 5.

## What was validated (live, 2026-06-12)

Setup: `nab-host.vercel.app` (host shell) cross-site-iframing `nab-tenant.vercel.app`
(tenant app) — two distinct `*.vercel.app` sites under the Public Suffix List — with a
real multi-tenant Microsoft Entra registration and an Upstash-KV-backed transfer store.
Chrome, Incognito.

- **Warm popup completes the handoff.** A top-level tenant-app session exists first
  (established by signing into the standalone tenant app on its own origin — in
  production the host's enterprise SSO does this for you). Signing in inside the iframe
  opens the top-level `/auth/popup`, which reads that existing session, posts the
  one-time handle to its opener, and self-closes — no interactive Entra login page.
  `window.opener` survived (the `force-dynamic` `/auth/*` serving fix held; had the
  opener still been null the handle could not have been delivered).
- **>=2 tenants.** `/t/acme` (the embedded cross-site + CHIPS capture) and `/t/globex`
  both reached signed-in. The `/t/[tenant]` route is tenant-agnostic.
- **CHIPS partition enforcement (DevTools).** Under the `nab-host` top-level partition,
  the tenant's `__Secure-authjs.session-token` shows `Partitioned; SameSite=None;
  Secure; HttpOnly; Path=/`, partition key = `nab-host`, Cross-site checked. Under the
  tenant app's OWN top level (`nab-tenant.vercel.app/t/acme`) that partitioned row is
  ABSENT — only the first-party `Lax` cookie. The browser isolates the cookie by
  partition.

## Why this matters for the threat model

Two items `docs/threat-model.md` explicitly deferred to a real-browser check (the D-11
honesty boundary on THREAT-06) are now resolved by the recorded evidence:

1. **Real CHIPS partition enforcement** — previously only emission + data flow were
   bench-proven. The DevTools captures show the browser actually isolating the cookie
   to the embedding partition (present under `nab-host`, absent under `nab-tenant`'s own
   top level).
2. **Consume transport (fetch vs. navigation)** — the credentialed `fetch` in
   `redeemHandle` committed the `Partitioned` cookie under the correct partition. The
   "prefer fetch" default is now empirically validated, not assumed.

No threat-model invariant changed; the recorded evidence simply discharges the
browser-only verification the document said was outstanding.

## Reconciliation note

The realized flow is the warm-reader model (popup reads an existing session, posts the
handle, self-closes; opener drives consume via fetch). The earlier `prompt=none`-in-
popup approach was reverted (a popup self-redirect nulls `window.opener`); see
`.planning/debug/resolved/popup-window-opener-null.md` for the root-cause record.

## Verification

- Live walkthrough recorded in `examples/tenant-app/docs/live-validation.md` (sections 3
  and 4: cross-site sign-in for >=2 tenants + the CHIPS DevTools observation, including
  the cross-partition isolation check).
- Pre-deploy bench: `pnpm -r test` PASS (recorded in the same doc, anchored to its
  commit). Current bench remains green (`packages/core` 105/105; `tenant-app` 5 passed /
  2 skipped; `host-shell` no tests).

## Not captured (acceptable)

- `GET /auth/popup` network status (200 vs. 307/308) was not separately recorded. The
  successful handoff implies the opener was not severed, so it was not needed to close
  the gate — flagged in the debug record for a future run if the popup ever regresses.
