---
quick_id: 260611-lzt
slug: rework-reference-example-to-production-w
date: 2026-06-11
---

# Quick Task: Rework reference example to the production warm-popup model

Drop the cold-start interactive bootstrap + BroadcastChannel; model the warm popup
that a real enterprise embed (host SSO under the same Entra IdP) always has.

## Rationale

The cold interactive `signIn`-in-popup + BroadcastChannel handback modeled a
problem that does not exist in the real Mode A flow and cannot be solved the way
it was attempted: storage partitioning isolates a partitioned third-party iframe
from a first-party top-level popup, so a BroadcastChannel never connects them. In
production the popup is always WARM (the user is already signed into the host/IdP),
so it reads the session, fetches the bridge, postMessages the code, and self-closes.

## Tasks

1. Bridge popup (`examples/tenant-app/app/auth/popup/page.tsx`): remove interactive
   signIn + BroadcastChannel. Warm flow: with opener + session, run the bridge flow
   and self-close (`window.close()`). Keep the no-opener launcher branch (in-iframe
   entry). If opener present but no session, show a clear "session not warm" message
   (do NOT sign in interactively).

2. Package revert (`packages/core`): drop the `broadcast` dep from `runPopupFlow`
   and `addBroadcastListener` from `openAuthPopup`; deliver via `opener.postMessage`
   only. Keep the opt-in close-poll. Keep `popupWin.close()` as harmless best-effort
   (the popup self-closes; the opener close is a no-op then). Revert the
   `docs/threat-model.md` THREAT-03 BroadcastChannel additions. Trim the
   BroadcastChannel tests.

3. Self-contained session bootstrap: a top-level "Establish SSO" page
   (`/auth/establish-sso` or the launcher area) the user visits FIRST (not embedded)
   that runs the normal top-level Auth.js signIn, standing in for enterprise SSO.
   Document the precondition.

4. Lock consume transport to fetch (`examples/tenant-app/lib/consume-transport.ts`):
   mark VARIANT A (fetch) resolved; drop the "documented fallback / not the active
   path" framing for VARIANT B (keep a brief note that navigation exists but fetch
   is the resolved transport).

## Acceptance

- No interactive signIn and no BroadcastChannel remain in `examples/` or `packages/`.
- Bridge popup is warm-only: reads session, fetches bridge, postMessages code,
  self-closes.
- `consume-transport.ts` locked to fetch.
- `pnpm -r test` green.
- No internal req-IDs in committed `examples/` or `packages/` source.
- `docs/threat-model.md` THREAT-03 back to the postMessage-only boundary.
