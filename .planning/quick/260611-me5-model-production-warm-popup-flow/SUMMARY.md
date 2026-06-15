---
quick_id: 260611-me5
slug: model-production-warm-popup-flow
date: 2026-06-11
status: complete
---

# Quick Task Summary: production warm-popup flow (host SSO + silent prompt=none)

Modeled the production flow faithfully: the simulated enterprise host now
authenticates against Entra first, against the SAME app registration the tenant
app uses, so a shared Entra SSO session (and consent) exists. The tenant-app
bridge popup then mints its top-level session via a SILENT `prompt=none` auth that
leverages that session — no interactive login in the popup, no COOP severance, no
BroadcastChannel. The earlier `establish-sso` top-level-session stand-in is gone.

The prior task (`260611-lzt`) had already reverted the BroadcastChannel cold-path
in `packages/core` and locked `consume-transport.ts` to fetch; this task adds the
two genuinely-new pieces (host Entra auth + real silent auth) and removes the
stand-in.

## Commits

- `32dd6a4` feat(host-shell): gate the embedded iframe behind Entra sign-in
- `3ef17d5` feat(tenant-app): silent prompt=none popup auth, drop the establish-sso stand-in

## What changed

**Host-shell (`examples/host-shell`) — behind Entra:**
- `auth.ts`: Auth.js v5 + Microsoft Entra provider (`/common`), env-driven secrets.
- `app/api/auth/[...nextauth]/route.ts`: re-export the generated handlers.
- `app/page.tsx`: now a server component. Signed out → a host sign-in button
  (server action `signIn("microsoft-entra-id")`, full-page navigation). Signed in →
  the cross-site iframe (existing copy) + a sign-out control. The iframe renders
  ONLY when the host is authenticated.
- `package.json`: added `next-auth`.
- `.env.example`: `AUTH_SECRET` + Entra registration vars, with the shared-
  registration / dual-redirect-URI note.

**Tenant-app (`examples/tenant-app`) — silent prompt=none popup:**
- `app/auth/silent/page.tsx` (new): a server action runs
  `signIn("microsoft-entra-id", { redirectTo: "/auth/popup" }, { prompt: "none" })`,
  auto-submitted on mount by `auto-submit.tsx`. With the host's SSO present, Entra
  bounces back without a login form (opener preserved). On an interaction-required
  `AuthError` it redirects to `/auth/popup?warm=0`.
- `app/auth/silent/auto-submit.tsx` (new): tiny client child that clicks a hidden
  submit on mount (Strict-Mode guarded); `<noscript>` fallback in the form.
- `app/auth/popup/page.tsx`: opener present + not warm → navigate to `/auth/silent`;
  on return, warm → `runPopupFlow` → postMessage → self-close; `?warm=0` → a clear
  "sign in to the host first" message. No interactive `signIn` in the popup. The
  no-opener launcher branch is unchanged.
- Removed `app/auth/establish-sso/page.tsx`.

**Reverts confirmed already in place (no change needed):**
- `packages/core`: no `BroadcastChannel` / `addBroadcastListener`; `runPopupFlow`
  delivers via `opener.postMessage` only; `openAuthPopup` keeps the best-effort
  `popupWin.close()`.
- `docs/threat-model.md` THREAT-03 = postMessage-only boundary.
- `lib/consume-transport.ts` locked to fetch (resolved); the navigation helper kept
  only as a harmless reference.

## Verification

- `pnpm -r test`: green — `packages/core` 105/105, `tenant-app` 5 passed / 2 skipped,
  `host-shell` clean.
- `next build` (tenant-app): succeeds; routes include `/auth/silent`, no
  `/auth/establish-sso`. `next build` (host-shell): succeeds; `/` is dynamic and
  `/api/auth/[...nextauth]` present.
- `tsc --noEmit`: clean across both example apps (after clearing the stale
  `.next/types` validator entry the deleted page left behind).
- No `establish-sso` / `BroadcastChannel` / `addBroadcastListener` in any committed
  `examples/` or `packages/` source; popup page imports no `signIn`. No internal
  req-IDs in committed example source.
- Build-time `tsconfig.json` / `next-env.d.ts` churn (Next canary reformatting,
  `.next/dev/types`) was reverted so the commits stay scoped.

## Acceptance — met

- [x] host-shell requires Entra sign-in before it renders the embed.
- [x] Tenant-app popup mints the session via silent `prompt=none` (server-side
      signIn with `authorizationParams: { prompt: "none" }`); warm path posts the
      code and self-closes, no interactive login page.
- [x] No-host-SSO path shows a clear "sign in to the host first" message (no
      interactive popup login).
- [x] No interactive `signIn`-in-popup and no BroadcastChannel remain.
- [x] `consume-transport.ts` locked to fetch.
- [x] `pnpm -r test` green; `tsc --noEmit` clean.
- [ ] Live re-validation against real Entra (redeploy host-shell + tenant; host
      sign-in → embedded popup completes via silent auth for ≥2 tenants
      /t/acme, /t/globex). Requires deploy + the shared registration's redirect
      URIs configured; not runnable from local CI.
