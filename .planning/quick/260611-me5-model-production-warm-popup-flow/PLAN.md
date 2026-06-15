---
quick_id: 260611-me5
slug: model-production-warm-popup-flow
date: 2026-06-11
---

# Quick Task: model the production warm-popup flow (host SSO + silent prompt=none)

Faithfully model the production flow: authenticate the HOST against Entra, share
one Entra app registration across both origins so the IdP SSO session + consent
are shared, and have the tenant-app bridge popup mint its top-level session via a
SILENT `prompt=none` auth that leverages the host's existing SSO — no interactive
login in the popup, no COOP severance, no BroadcastChannel.

Prior task `260611-lzt` already reverted the BroadcastChannel cold-path in
`packages/core` and locked `consume-transport.ts` to fetch. This task adds the two
genuinely-new pieces and replaces the `establish-sso` stand-in with a real silent
auth.

## Locked decisions

- **Silent-auth trigger:** dedicated `/auth/silent` route in the tenant app calling
  `signIn("microsoft-entra-id", { redirectTo: "/auth/popup" })` with
  `authorizationParams: { prompt: "none" }`. The popup self-navigates there on open.
  On return it is warm (session minted, no login page rendered) or carries an Entra
  error (`login_required`) surfaced as a clear "sign in to the host first" message.
- **Host gating:** host-shell home is a server component calling `auth()`. No
  session → render a "Sign in to the host" button wired to a `signIn` server action
  (full-page navigation). Only when authenticated does it render the `<iframe>`.
- Same Entra app registration (same client ID) for host-shell and tenant-app; both
  origins' redirect URIs registered so SSO + consent are shared.

## Tasks

1. **host-shell — Auth.js + Entra, gate the iframe**
   - Add `next-auth` dependency; create `auth.ts` (Entra provider, `/common`, env-
     driven secrets) mirroring the tenant app's config (minus the `tid` plumbing —
     host only needs a session).
   - Add `app/api/auth/[...nextauth]/route.ts` re-exporting `handlers`.
   - Rewrite `app/page.tsx` as a server component: `auth()` → if signed out, render
     a sign-in button (server action `signIn("microsoft-entra-id")`); if signed in,
     render the embedded iframe (existing copy) + a sign-out control.
   - Extend `.env.example` with `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID/SECRET/
     ISSUER` (placeholders, shared-registration note).

2. **tenant-app — `/auth/silent` route + warm/silent popup**
   - New `app/auth/silent/page.tsx` (server component): a server action that calls
     `signIn("microsoft-entra-id", { redirectTo: "/auth/popup", ... })` with
     `authorizationParams: { prompt: "none" }`. Auto-submit on load so the popup's
     navigation here is silent. On the Entra error return, land back on `/auth/popup`
     with a flag the popup reads as "not warm".
   - Rework `app/auth/popup/page.tsx`: opener present + no session yet → navigate the
     popup to `/auth/silent` (silent prompt=none). After return, probe the bridge;
     warm → runPopupFlow → postMessage → self-close; `login_required`/no session →
     "sign in to the host first" message (no interactive popup login). Keep the
     no-opener → launcher branch.
   - Remove `app/auth/establish-sso/page.tsx` (the stand-in the silent route
     replaces) and any links to it.

3. **Confirm reverts already in place (no-op verify, fix if needed)**
   - `packages/core`: no BroadcastChannel / `addBroadcastListener` (verified clean).
   - `docs/threat-model.md` THREAT-03 = postMessage-only (verified).
   - `consume-transport.ts` locked to fetch (verified; tighten wording if it still
     frames fetch as not-resolved — it does not).

4. **Tests + build green**
   - Trim/adjust any tenant-app tests referencing `establish-sso`.
   - `pnpm -r test` green; `tsc --noEmit` clean across the three packages.

## Constraints

- OSS discipline: no internal req-IDs in committed `examples/` or `packages/`
  (THREAT-NN only in `docs/threat-model.md`). English artifacts.
- Threat-model: no invariant weakened; only the already-applied THREAT-03 revert.
- Functional style; TypeScript strict, no `any` outside test scaffolding.
- Conventional Commits, atomic.

## Acceptance

- [ ] host-shell requires Entra sign-in before it renders the embed.
- [ ] Tenant-app popup performs silent `prompt=none` auth: opens, mints the session
      without an interactive login page, posts the code, self-closes.
- [ ] No-host-SSO path shows a clear "sign in to the host first" message (no
      interactive popup login).
- [ ] No interactive `signIn`-in-popup and no BroadcastChannel remain.
- [ ] `consume-transport.ts` locked to fetch.
- [ ] `pnpm -r test` green; `tsc --noEmit` clean.
