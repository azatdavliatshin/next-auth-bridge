---
slug: cold-start-silent-auth
date: 2026-06-15
status: complete
branch: feat/cold-start-silent-auth
commit: 8a19450
---

# Summary — cold-start case (a): silent prompt=none in /auth/popup

## What changed

- **`examples/tenant-app/app/auth/popup/page.tsx`** — the not-warm + top-level
  branch no longer dead-ends on the "sign in to the app first" notice. It now
  attempts ONE silent `prompt=none` sign-in via Auth.js. If the host already has
  an IdP SSO session, the tenant session is minted with no prompt, the page
  re-renders warm, and the existing `runPopupFlow` handle-delivery path runs
  unchanged. Guarded by `?silent=attempted` (and `?error`) so a cold visit (no
  host SSO) falls through to the notice exactly once — no redirect loop.
- **`examples/tenant-app/auth.ts`** — added `pages: { error: "/auth/popup" }`
  so an Auth.js OAuth error (e.g. `login_required` from the failed silent auth)
  lands on `/auth/popup?error=...` and shows the popup's own notice instead of
  Auth.js's default error page.

## Decisions / deviations

- Used the existing `AUTH_PROVIDER_ID` from `@/lib/auth-provider` (the codebase's
  single source of truth, already used by `sign-in-button.tsx`) instead of
  duplicating the `NEXT_PUBLIC_AUTH_PROVIDER` ternary as a local `PROVIDER` const.
- Committed as **`chore(examples)`** not `feat(examples)`: the change touches only
  the example app (never part of the published npm tarball — `next-auth-bridge`
  publishes `packages/core/dist` only), so a `feat` would phantom-bump the
  published package minor for a non-product change. `chore` keeps the version put.
- Probe pages (`app/probe/`, `app/auth/popup-probe/`) existed ONLY on the
  `auth-cold-start-probe` spike branch, never on `dev` — nothing to `rm` in tree.

## Cleanup

- Deleted local + remote `auth-cold-start-probe` branch.
- Vercel CLI not installed/authenticated locally; branch deletion de-aliases the
  preview (no longer served). Full deployment-record removal left to maintainer.

## Verification

- `pnpm test` (tenant-app): 5 passed, 2 skipped — roundtrip test green.
- `npx tsc --noEmit`: clean.
- `pnpm build` (next build): success; route table shows `/auth/popup`, no probe
  routes. Build-tool churn in `next-env.d.ts` / `tsconfig.json` reverted.
- packages/core, middleware, threat-model untouched. No new routes/endpoints.

## Out of scope

Fully-interactive cold-start (case b, no host SSO) — separate rendezvous design.
