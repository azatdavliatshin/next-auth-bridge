---
slug: cold-start-silent-auth
created: 2026-06-15
type: quick
branch: feat/cold-start-silent-auth
---

# Cold-start case (a): silent prompt=none in the real popup

Replace the dead-end "sign in to the app first" tail of the top-level `/auth/popup`
branch (example app only) with a ONE-SHOT silent `prompt=none` re-auth, then fall
through to the existing handle-delivery path. A probe confirmed `window.opener`
survives a `prompt=none` round-trip and `postMessage` is delivered in Chrome +
Safari Private, so no server rendezvous / SSE / new endpoint is needed.

## Scope

- CHANGE 1 — `examples/tenant-app/app/auth/popup/page.tsx`: one-shot silent
  `prompt=none` attempt in the not-warm + top-level branch, loop-guarded by
  `?silent=attempted` / `?error`.
- CHANGE 2 — `examples/tenant-app/auth.ts`: `pages: { error: "/auth/popup" }` so
  an OAuth `login_required` lands back on the popup notice instead of Auth.js's
  default error page.
- CLEANUP — delete throwaway probe pages + spike branch + its Vercel preview.

## Decisions

- Use the existing `AUTH_PROVIDER_ID` from `@/lib/auth-provider` (the codebase's
  single source of truth, already used by `sign-in-button.tsx`) instead of
  duplicating the `NEXT_PUBLIC_AUTH_PROVIDER` ternary as a local `PROVIDER` const.
  This is the cleaner realization of the task's "match sign-in-button.tsx's import".
- Probe pages (`app/probe/`, `app/auth/popup-probe/`) live only on the
  `auth-cold-start-probe` spike branch, not on `dev` — nothing to delete in-tree;
  the spike branch + Vercel preview are the cleanup targets.

## Out of scope

Fully-interactive cold-start (case b, no host SSO) — separate rendezvous design.
`packages/core`, middleware, threat-model untouched. No new routes/endpoints.

## Acceptance

- Warm path unchanged (roundtrip test green; build + lint clean).
- Host SSO present + no tenant session => popup silently mints session, iframe ends
  authenticated with no second prompt.
- No host SSO => popup tries `prompt=none` ONCE, falls gracefully to the notice, no loop.
