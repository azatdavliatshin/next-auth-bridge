# next-auth-bridge

**Cross-context authentication bridge for Next.js apps — any cookie-session auth, demonstrated with Auth.js and Better Auth; a popup bridge for enterprise iframe-SSO.**

> The "auth" in `next-auth-bridge` means *authentication*, not *Auth.js*. It is agnostic by design — the bridge plugs into any cookie-session auth library through one `verifySession` + `cookieName` seam, shown here with two: Auth.js and Better Auth.

Sign a user in once on the host page. Reuse that session inside an `<iframe>` embedded in MS SharePoint, Teams Tab, Salesforce Lightning, ServiceNow, Confluence/Jira, or any enterprise portal with a shared identity-provider session. CHIPS-partitioned cookies make it work across modern browsers' 3rd-party-cookie restrictions, with a one-time-code bridge that never puts a session token in a URL.

```bash
pnpm add next-auth-bridge
# requires: next ≥ 14, a cookie-session auth library (Auth.js or Better Auth demonstrated), a server-side KV store
```

> **Status:** published — [`next-auth-bridge@0.2.0`](https://www.npmjs.com/package/next-auth-bridge) on npm (with SLSA provenance). Mode A (popup bridge) is complete; the API is stable within 0.x. See [Roadmap](#roadmap).
>
> **Looking ahead:** A future major adds Mode B — PWABuilder-wrapped iOS apps (`ASWebAuthenticationSession` for native passkey support). The transferStore architecture is designed so Mode B lands as an additive change — no breaking changes for current consumers. See [Roadmap](#roadmap) for details.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Live demo](#live-demo)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [How it works](#how-it-works)
- [Compatibility matrix](#compatibility-matrix)
- [Why this, and not...?](#why-this-and-not)
- [Threat model](#threat-model)
- [Examples](#examples)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

Your Next.js app is embedded in a host application — MS SharePoint, Teams Tab, Salesforce Lightning, ServiceNow, Confluence/Jira, or a custom enterprise portal. The host already has the user signed in to the shared identity provider (typically Microsoft Entra). But Safari ITP, Chrome 3rd-party-cookie deprecation, and Firefox ETP block the iframe from seeing the host's cookies. From the user's perspective they're already signed in; from your iframe's perspective they're anonymous.

The mainstream alternatives don't fit cleanly with a cookie-session Next.js auth setup:

- **Bare iframe sign-in** forces the user through a redundant login flow they already completed at the host.
- **Storage Access API** requires a permission prompt that breaks the silent-SSO UX.
- **Pure CHIPS partitioned cookies without a bridge** don't inherit the host session — your iframe gets its own anonymous partition.
- **Vendor SDKs** (Auth0, Okta, Clerk) lock you into their hosted identity, which self-hosted auth (Auth.js, Better Auth) exists specifically to avoid.

> **On the name.** `next-auth` was Auth.js's old npm package name, so `next-auth-bridge` reads to many as "an Auth.js-only tool." It isn't. The "auth" here is *authentication* — the bridge is library-agnostic by design, wiring into any cookie-session auth library through one `verifySession` + `cookieName` seam, and is demonstrated with Auth.js and Better Auth.

This package solves the inheritance problem with a one-time-code bridge: a popup window auths in the top-level browser context (silently, against the host's existing identity-provider session), mints a 256-bit one-time code via the server-side transferStore, and posts it back to the iframe — which exchanges it for a CHIPS-partitioned session cookie of its own. No session token ever travels through a URL.

---

## Live demo

Try the popup-bridge end-to-end without a Microsoft account — sign in with a
seeded test user against a self-hosted Keycloak.

**Demo URL:** **[nab-host.vercel.app](https://nab-host.vercel.app/)** — start here (the enterprise host). The embedded tenant app lives at [nab-tenant.vercel.app/t/demo](https://nab-tenant.vercel.app/t/demo).

**Test credentials:** `bridge-test-user` / `bridge-test-password`

**The flow, in one line:** sign in on the host → the embedded app appears → the
iframe signs itself in via the popup bridge (no second login prompt).

> ⚠️ **Demo only.** These credentials are public on purpose and the instance is
> throwaway. Not production — never reuse this realm, client, or user.

The demo runs both example apps on two distinct Vercel origins (so the CHIPS
cross-site handoff is real) against a hosted Keycloak. The default reference
deployment uses Microsoft Entra; the public demo flips one env var
(`NEXT_PUBLIC_AUTH_PROVIDER=keycloak`) to swap in Keycloak so anyone can sign in.
Hosting instructions: [examples/keycloak-demo/DEPLOY.md](./examples/keycloak-demo/DEPLOY.md).

---

## Quick start

### 1. Install

```bash
pnpm add next-auth-bridge
```

The package exposes three import paths: `next-auth-bridge` (the main entry —
`createAuthBridge` and the client helpers), `next-auth-bridge/store/kv` (the production
transfer-store adapter), and `next-auth-bridge/middleware` (the Edge-safe routing surface —
`createBridgeMiddleware`, `detectContext`). Edge middleware must import from the
`/middleware` subpath: the main entry reaches `node:crypto` (via the store), which a Next.js
Edge bundle cannot include.

### 2. Wire the bridge from one shared config

One config wires both routes. The shape is library-neutral — only two of the
arguments (`verifySession` and `cookieName`) carry your auth library's specifics;
everything else (`store`, `allowedOrigins`, `secure`) is identical across libraries.

```ts
// lib/auth-bridge.ts
import { createAuthBridge } from 'next-auth-bridge';
import { createKVTransferStore } from 'next-auth-bridge/store/kv';

// `createAuthBridge` returns { bridge, consume }.
export const { bridge, consume } = createAuthBridge({
  // Production transfer store (Upstash/Vercel KV via env). Use
  // createInMemoryTransferStore() from 'next-auth-bridge' in tests.
  store: createKVTransferStore(),

  // The real security gate: the bridge mints a handle only after your auth
  // library confirms a genuine session. (Per-library delta below.)
  verifySession: /* your auth library's session getter — see below */,

  // The session-cookie base name to harvest/set. Omit for Auth.js (its default).
  // (Per-library delta below.)
  // cookieName: /* only if not Auth.js's default */,

  // The cross-site Origin allowlist for both routes. The embedding host and your
  // app are distinct sites (the whole point of the CHIPS handoff) — list both.
  allowedOrigins: [process.env.HOST_SHELL_ORIGIN ?? '', process.env.APP_ORIGIN ?? ''],

  // HTTPS deployment → the __Secure- session-cookie name.
  secure: true,
});
```

The only per-library difference is at the `verifySession` / `cookieName` seam. Plug in
one of the two demonstrated libraries (full copy-paste wiring lives in the linked example apps):

**Auth.js**

```ts
import { auth } from '@/auth'; // your Auth.js instance

// verifySession: Auth.js confirms a genuine session.
// cookieName: omitted — Auth.js is the default (__Secure-authjs.session-token).
verifySession: () => auth(),
```

**Better Auth**

```ts
import { headers } from 'next/headers';
import { getBetterAuthCookieName } from 'next-auth-bridge';
import { auth } from '@/lib/auth';

// verifySession: Better Auth's analog of () => auth().
verifySession: async () => auth.api.getSession({ headers: await headers() }),
// cookieName: DERIVED from the flag via the helper — never a hardcoded __Secure- literal.
cookieName: getBetterAuthCookieName({ secure: true }),
```

### 3. Wire up the route handlers

```ts
// app/auth/bridge/route.ts
import { bridge } from '@/lib/auth-bridge';

export const GET = (request: Request): Promise<Response> => bridge(request);
export const POST = (request: Request): Promise<Response> => bridge(request);
```

```ts
// app/auth/consume/route.ts
import { consume } from '@/lib/auth-bridge';

export const GET = (request: Request): Promise<Response> => consume(request);
```

### 4. Route embedded requests to the popup

```ts
// middleware.ts
import { createBridgeMiddleware } from 'next-auth-bridge/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge-safe, UX-only signal — presence of the session cookie, not a verification.
// Use your auth library's session-cookie base name:
//   Auth.js      → '__Secure-authjs.session-token'
//   Better Auth  → '__Secure-better-auth.session_token'
const SESSION_COOKIE = '__Secure-authjs.session-token';

const route = createBridgeMiddleware({
  popupEntryPath: '/auth/popup',
  isAuthenticated: (req) =>
    req.headers.get('cookie')?.includes(`${SESSION_COOKIE}=`) ?? false,
});

export function middleware(request: NextRequest): NextResponse {
  const decision = route(request);
  if (decision?.action === 'rewrite') {
    return NextResponse.rewrite(decision.destination);
  }
  return NextResponse.next();
}
```

### 5. Add the popup page

```tsx
// app/auth/popup/page.tsx
'use client';

import { useEffect } from 'react';
import { runPopupFlow } from 'next-auth-bridge';

// The warm popup runs top-level, reads the existing session, posts the one-time
// handle to its opener, and self-closes. It never navigates itself (that would
// null window.opener and lose the handle).
export default function PopupPage() {
  useEffect(() => {
    const opener = window.opener as Window | null;
    if (!opener) return;
    void runPopupFlow({
      opener,
      hostOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN ?? window.location.origin,
      // fetch + bridgePath default to global fetch and '/auth/bridge'.
    }).then(() => window.close());
  }, []);

  return <p>Completing sign-in…</p>;
}
```

### 6. Trigger the flow from your sign-in UI

```tsx
// a client component on your sign-in page
'use client';

import { openAuthPopup, OpenAuthPopupError } from 'next-auth-bridge';

const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? window.location.origin;

export async function signInViaBridge(): Promise<void> {
  try {
    // Open the top-level popup and await the one-time handle it posts back.
    const { code } = await openAuthPopup({
      allowedOrigins: [appOrigin],
      popupUrl: '/auth/popup',
      timeoutMs: 60_000,
    });

    // Redeem the handle for the partitioned session cookie. credentials:'include'
    // so the Set-Cookie commits under the correct (top-level) CHIPS partition.
    await fetch(`/auth/consume?code=${encodeURIComponent(code)}`, {
      credentials: 'include',
      redirect: 'follow',
    });

    window.location.reload();
  } catch (err) {
    if (err instanceof OpenAuthPopupError) {
      // err.reason is 'popup-blocked' | 'popup-closed' | 'timeout' | 'auth-error'
      console.error('sign-in failed:', err.reason);
    }
  }
}
```

That's the minimal integration. See [`examples/tenant-app`](./examples/tenant-app) for the
complete embedded app showing the popup-bridge flow end-to-end against a real Microsoft
Entra app registration deployed to Vercel preview, and [`examples/host-shell`](./examples/host-shell)
for the host page that embeds it.

---

## Environment variables

The library itself reads **no** environment variables. Everything `createAuthBridge`
needs — the transfer store, `verifySession`, the origin allowlist, the `secure` flag — is
passed in as configuration, so you can source those values however your app prefers. The
variables below are what a real deployment ends up needing: a few come from your auth
library (Auth.js or Better Auth), one pair is read by the default KV store adapter, and
the rest are the origins you choose to feed into the config.

### Required

These come from your auth library — grouped by the two demonstrated libraries.

**Auth.js**

| Variable | Read by | Purpose |
| --- | --- | --- |
| `AUTH_SECRET` | Auth.js (peer dependency) | Session/JWT encryption secret. Generate with `npx auth secret`. |
| _Your identity-provider credentials_ | Auth.js provider | Whatever your chosen Auth.js OAuth provider requires — e.g. `AUTH_MICROSOFT_ENTRA_ID_ID` / `_SECRET` / `_ISSUER` for Microsoft Entra, or `AUTH_KEYCLOAK_ID` / `_SECRET` / `_ISSUER` for Keycloak. |

**Better Auth**

| Variable | Read by | Purpose |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Better Auth | Session/token signing secret. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Better Auth | The app's base URL (used for callbacks). |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Better Auth (session/user DB) | Hosted libSQL (Turso) connection for Better Auth's session and user tables. |
| `AUTH_KEYCLOAK_ID` / `_SECRET` / `_ISSUER` | Better Auth genericOAuth | The SAME shared-Keycloak social-provider credentials as the Auth.js set (the shared-IdP demo — see [How it works](#how-it-works)). |

### Transfer store (default KV adapter)

`createKVTransferStore()` wraps `@upstash/redis`, which auto-configures from the environment
via `Redis.fromEnv()`. Set **one** of these pairs (the `KV_*` names are what Vercel KV
injects; the `UPSTASH_*` names are the Upstash-native equivalents — they are interchangeable):

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL` _or_ `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint. |
| `KV_REST_API_TOKEN` _or_ `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token. |

Not needed if you pass your own store (e.g. `createInMemoryTransferStore()` in tests, or a
custom adapter) to `createAuthBridge({ store })`.

### Origins (you choose how to supply these)

These are not read by the package — they are values you pass into the config and the client
helpers. The Quick Start above wires them from `process.env`, which is the convention the
example apps follow:

| Variable | Used for |
| --- | --- |
| `APP_ORIGIN` | Your app's own origin — a `createAuthBridge({ allowedOrigins })` entry and the popup `postMessage` receiver. |
| `HOST_SHELL_ORIGIN` | The separate site that cross-site-iframes your app — the other `allowedOrigins` entry. Must be a different site from `APP_ORIGIN` for the CHIPS handoff to be real. |
| `NEXT_PUBLIC_APP_ORIGIN` | Browser-exposed copy of the app origin for the client popup page (falls back to `window.location.origin`). |

The example apps ship a fully annotated `.env.example` enumerating every variable for the
embedded-iframe scenario, including the Entra/Keycloak provider switch
(`NEXT_PUBLIC_AUTH_PROVIDER`): see
[`examples/tenant-app/.env.example`](./examples/tenant-app/.env.example) and
[`examples/host-shell/.env.example`](./examples/host-shell/.env.example).

---

## How it works

The diagram below traces the **warm handoff** — the host already holds an active session,
so the popup completes silently. This warm path is the library-agnostic core: it works for
any cookie-session auth library. (Labels use "your auth library" / "your IdP"; the bracketed
notes show Microsoft Entra as one worked example.)

```
[host page with an active session to your IdP — e.g. Microsoft Entra]
        │
        │  loads <iframe src="https://your-app.example/...">
        ▼
[your Next.js app inside iframe — no session cookie due to 3pc blocking]
        │
        │  detection: window.location !== window.parent.location
        │  middleware redirects user to /auth (sign-in page)
        ▼
[sign-in page]
        │
        │  detectContext() === 'iframe'
        │  openAuthPopup() → window.open('/auth/popup', ...)
        ▼
[popup window — top-level browser context]
        │
        │  your auth library's signIn() → OAuth redirect to your IdP
        │  (e.g. Auth.js signIn('microsoft-entra-id') → login.microsoftonline.com)
        │
        │  ⚡ your IdP sees the host's existing session cookies
        │     (top-level browser context — not iframe)
        │     Returns authorization code WITHOUT user prompt
        ▼
[OAuth callback at your auth library's callback route]
        │  (e.g. /api/auth/callback/microsoft-entra-id)
        │
        │  your auth library exchanges code for session, sets session cookie
        │  redirects to /auth/popup
        ▼
[/auth/popup page]
        │
        │  fetch GET /auth/bridge?popup=true
        ▼
[/auth/bridge?popup=true (server)]
        │
        │  reads your auth library's session cookie from request
        │  generates 256-bit handle, stores {cookie-name, cookie-value, next} in transferStore
        │  returns JSON { code }
        ▼
[/auth/popup receives { code }]
        │
        │  window.opener.postMessage({ type: 'auth-success', code }, origin)
        │  window.close()
        ▼
[opener (iframe) receives postMessage]
        │
        │  verifies event.origin === window.location.origin
        │  fetch GET /auth/consume?popup=true&code=...
        ▼
[/auth/consume?popup=true (server)]
        │
        │  looks up code in transferStore, deletes (one-time-use)
        │  returns JSON { ok: true } with Set-Cookie:
        │    name=<session-token>; HttpOnly; Secure; SameSite=None; Partitioned
        ▼
[iframe now has session cookie under CHIPS partition]
        │
        │  window.location.reload()
        ▼
[iframe is authenticated]
```

**User-visible UX:** the popup window appears for under a second and closes. No login prompt if the host SSO is active. To the user, the iframe simply "becomes signed in".

**Cold-start (no tenant session yet):** a `prompt=none` silent re-auth can complete the handoff with no interactive login page — but only when the tenant and host share an identity provider. This is a *demonstrated* capability, shown with a shared Keycloak in the [Better Auth live validation](./examples/ba-tenant-app/docs/live-validation.md), not something automatic for every library. The warm handoff above is the agnostic core; cold-start silent re-auth depends on the shared-IdP setup.

**Why it works:** the consume response sets `Partitioned` on the cookie, which is what makes it readable inside the cross-context iframe under modern browsers' [CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) policy. See [Compatibility matrix](#compatibility-matrix) for browser support.

The transferStore code is 256-bit hex from `crypto.randomBytes(32)`, single-use, deleted on first read, with a default TTL of 60 seconds. No session token ever appears in a URL.

---

## Compatibility matrix

| Surface | Supported |
|---|---|
| **Next.js** | 14, 15 (App Router; Pages Router planned) |
| **Auth library** | Auth.js v5 ≥ 5.0.0 and Better Auth — both demonstrated with live two-origin demos. Auth.js v4 (legacy NextAuth) not supported; planned if there is demand. Any cookie-session library wires in through the `verifySession` + `cookieName` seam. |
| **OAuth providers** | Any provider your auth library supports for authorization-code OAuth: Microsoft Entra, Google, Apple, GitHub, Okta, Auth0-as-IdP, Keycloak. Magic-link / password / WebAuthn-only providers planned for v0.3+. |
| **Browser (iframe)** | CHIPS partitioned cookies: Chrome 114+, Edge 114+, Firefox 130+, Safari 18+. Older Safari supported but cookie persistence may degrade to single session. |
| **TransferStore adapters** | Upstash Redis (production, via `@upstash/redis` — works with Vercel KV / Upstash REST env vars), in-memory (tests). Custom adapters via the `TransferStore` interface. |
| **Host applications (iframe)** | Any host page that hosts an iframe and supports `window.open` + `postMessage`. Tested against generic parent pages in CI. Real-host integration (SharePoint web part config, Teams Tab manifest, Salesforce Canvas) is host-side tooling and out of bridge scope. |

---

## Why this, and not...

| Alternative | When it's the right call instead | When it isn't |
|---|---|---|
| **Bare iframe sign-in (no bridge)** | Your users don't already have a session at the host — they need to sign in fresh inside the iframe anyway | The host already has the user signed in. Forcing a redundant login is bad UX. |
| **Storage Access API (`document.requestStorageAccess()`)** | You can accept a permission prompt | UX prompt is unacceptable. Also, it has uneven cross-browser support. |
| **Pure CHIPS partitioned cookies (no popup bridge)** | Your iframe can do its own independent auth from scratch | You want to inherit the host's existing identity-provider session silently |
| **Microsoft Teams Tab SDK with `notifySuccess`** | Your iframe is ONLY in Teams Tab and you're OK with the SDK lock-in | You want one auth flow that works in SharePoint, Salesforce, ServiceNow, etc. — not just Teams |
| **Vendor SDK (Auth0 SDK, Okta SDK, Clerk SDK)** | You're using that vendor's hosted identity | You're using self-hosted cookie-session auth (Auth.js, Better Auth). This package is the cross-context bridge for it. |
| **`expo-auth-session`** | You're using Expo Router | You're on Next.js. This package is Next.js-specific (any cookie-session auth). |

---

## Threat model

Short version. Full discussion in [docs/threat-model.md](./docs/threat-model.md).

- **Code entropy.** 256-bit (32-byte) CSPRNG output from `crypto.randomBytes(32).toString('hex')`. Stored in `transferStore`, exposed only as an opaque URL parameter for at most one round-trip.
- **TTL + one-time use.** Default 60 s. Deleted on first read. Replay attacks bounded.
- **PKCE.** OAuth flows preserve `code_verifier`/`code_challenge` across the bridge handoff. Without PKCE, an attacker intercepting the OAuth code in transit could exchange it.
- **No session token in URL.** Only the opaque handle travels through URLs. The actual session cookie is set by the server response, never visible to JavaScript or URL logs.
- **CSRF on `/auth/consume`.** Codes are one-time-use; second call returns 4xx. Origin checked when handle arrives via `postMessage`.
- **`sanitizeRedirects`.** `next` parameter rejected if starts with `/auth`, `/api/auth`, or `/auth/consume`. Prevents auth-loop and open-redirect attacks.
- **Wrapper / iframe detection is UX routing, not security.** A forged context-detection signal in a normal browser must not exfiltrate a session. `/auth/bridge` independently checks for an actual session before minting a handle.
- **`postMessage` origin checks.** Both popup and opener verify `event.origin === window.location.origin`. Mismatches are dropped silently.
- **Partitioned cookie.** Cookie is set with `Partitioned` attribute → CHIPS-compliant. Cross-context iframe can read its own partition; other iframes on the same domain under different partition keys cannot.

---

## Examples

- [`examples/tenant-app`](./examples/tenant-app) — **Recommended starting point.** The embedded Next.js app demonstrating the popup-bridge flow end-to-end against a real Microsoft Entra app registration, deployed to a Vercel preview. Multi-tenant pattern with per-tenant configuration.
- [`examples/host-shell`](./examples/host-shell) — the host page that embeds the tenant app in a cross-site iframe, so the CHIPS handoff can be exercised across two real origins.
- [`examples/keycloak-demo`](./examples/keycloak-demo) — the hosting runbook ([DEPLOY.md](./examples/keycloak-demo/DEPLOY.md)) behind the public [live demo](#live-demo): both apps on two Vercel origins against a self-hosted Keycloak.

---

## Roadmap

### Shipped (v0.1.0 → v0.2.0)

- Popup-bridge transport (Mode A) for Next.js apps embedded in enterprise iframes
- Auth.js v5 integration, App Router (Next.js 14 / 15)
- Auth-library-agnostic proof: Auth.js **and** Better Auth wired through the same `verifySession` + `cookieName` seam, each with its own live two-origin demo
- TransferStore: Upstash Redis adapter (production, via `@upstash/redis`) + in-memory adapter (tests), pluggable via the `TransferStore` interface
- Provider-agnostic proof: Microsoft Entra in the reference deployment + generic OIDC (Keycloak) in CI and the public demo
- Multi-tenant reference example (`tenant-app` + `host-shell`) deployed across two real Vercel origins; public Keycloak [live demo](#live-demo)
- First-time (cold-start) handling: one silent `prompt=none` attempt against the host SSO before falling back to a "sign in on the host first" notice
- `next-auth-bridge/middleware` Edge-safe routing surface (`createBridgeMiddleware`, `detectContext`)
- Threat model documented; every Mode A invariant has a passing negative-case Vitest
- semantic-release pipeline, Conventional Commits, commit-msg hook, `main` ruleset, npm publish via OIDC Trusted Publishing with SLSA provenance

### Planned

- **Mode B transport** — `ASWebAuthenticationSession`-based bridge for Next.js apps wrapped as native iOS via [PWABuilder's pwa-shell](https://github.com/pwa-builder/pwabuilder-ios). Unlocks passkeys in iCloud Keychain, autofill, Sign in with Apple, and saved credentials inside the wrapper. Additive on the existing transferStore — no breaking changes for current consumers.
- Auth.js docs recipe contributed upstream to authjs.dev (in-repo source finalized in [`docs/recipes`](./docs/recipes/authjs-cross-context-bridge.mdx); upstream PR pending)
- Minimal popup-only example app for Teams Tab / SharePoint iframe scenarios without PWA wrapping
- Pages Router support
- Auth.js v4 (legacy NextAuth) support — if community demand
- Android (Bubblewrap / TWA) — investigated; may "just work" via Chrome Custom Tabs

### Later

- Magic-link providers (handle-based mint without OAuth code)
- Password providers (same)
- WebAuthn-only providers (server-side credential mint)
- Capacitor / Cordova wrappers (different JS bridge mechanism)
- Further Next.js auth libraries beyond the two demonstrated (Auth.js, Better Auth) — e.g. Clerk, Auth0-via-Next.js-package

### Out of scope (not on roadmap)

- Generic "auth library for all native wrappers" — see [`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/) if that's what you need.
- Replacement for your auth library. This package complements your cookie-session auth (Auth.js, Better Auth); it does not redo OAuth or replace your auth library.

---

## Contributing

Issues and discussions welcome at [GitHub](https://github.com/azatdavliatshin/next-auth-bridge). PRs require:

- A test for the change (Vitest).
- An update to the relevant section in [docs/threat-model.md](./docs/threat-model.md) if security-relevant.
- A changeset describing the impact for users.

Engineering decisions are documented in PR descriptions and in [docs/release-governance.md](./docs/release-governance.md) and [docs/threat-model.md](./docs/threat-model.md).

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Acknowledgments

Thanks to [Kirill Evtushenko](https://www.linkedin.com/in/kirill-evtushenko/) ([GitHub](https://github.com/KirillEvtushenko)) for co-developing the popup-bridge pattern this package generalizes.

Works alongside your Next.js auth library ([Auth.js](https://authjs.dev/), Better Auth) — it complements your cookie-session auth, it doesn't replace it. Cross-context cookie handling follows the [CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) specification. The planned Mode B will implement [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) using Apple's [ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession) API.
