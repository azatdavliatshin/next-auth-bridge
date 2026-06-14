# next-auth-bridge

**Cross-context auth for Next.js apps with Auth.js — popup bridge for enterprise iframe-SSO.**

Sign a user in once on the host page. Reuse that session inside an `<iframe>` embedded in MS SharePoint, Teams Tab, Salesforce Lightning, ServiceNow, Confluence/Jira, or any enterprise portal with a shared identity-provider session. CHIPS-partitioned cookies make it work across modern browsers' 3rd-party-cookie restrictions, with a one-time-code bridge that never puts a session token in a URL.

```bash
pnpm add next-auth-bridge
# requires: next ≥ 14, next-auth (Auth.js) ≥ 5, a server-side KV store
```

> **Status:** pre-release. APIs are unstable until v0.1.0. Not yet on npm. See [Roadmap](#roadmap).
>
> **Looking ahead:** This package will also target PWABuilder-wrapped iOS apps (`ASWebAuthenticationSession` for native passkey support) in v0.2. The transferStore architecture is designed so v0.2 lands as an additive change — no breaking changes for v0.1.0 consumers. See [Roadmap](#roadmap) for details.

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Quick start](#quick-start)
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

The mainstream alternatives don't fit cleanly with Auth.js:

- **Bare iframe sign-in** forces the user through a redundant login flow they already completed at the host.
- **Storage Access API** requires a permission prompt that breaks the silent-SSO UX.
- **Pure CHIPS partitioned cookies without a bridge** don't inherit the host session — your iframe gets its own anonymous partition.
- **Vendor SDKs** (Auth0, Okta, Clerk) lock you into their hosted identity, which Auth.js exists specifically to avoid.

This package solves the inheritance problem with a one-time-code bridge: a popup window auths in the top-level browser context (silently, against the host's existing identity-provider session), mints a 256-bit one-time code via the server-side transferStore, and posts it back to the iframe — which exchanges it for a CHIPS-partitioned session cookie of its own. No session token ever travels through a URL.

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

```ts
// lib/auth-bridge.ts
import { createAuthBridge } from 'next-auth-bridge';
import { createKVTransferStore } from 'next-auth-bridge/store/kv';
import { auth } from '@/auth'; // your Auth.js instance

// One config wires both routes. `createAuthBridge` returns { bridge, consume }.
export const { bridge, consume } = createAuthBridge({
  // Production transfer store (Upstash/Vercel KV via env). Use
  // createInMemoryTransferStore() from 'next-auth-bridge' in tests.
  store: createKVTransferStore(),

  // The real security gate: the bridge mints a handle only after Auth.js
  // confirms a genuine session.
  verifySession: () => auth(),

  // The cross-site Origin allowlist for both routes. The embedding host and your
  // app are distinct sites (the whole point of the CHIPS handoff) — list both.
  allowedOrigins: [process.env.HOST_SHELL_ORIGIN ?? '', process.env.APP_ORIGIN ?? ''],

  // HTTPS deployment → the __Secure- session-cookie name.
  secure: true,
});
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

## How it works

```
[host page with active Microsoft Entra session]
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
        │  Auth.js signIn('microsoft-entra-id')
        │  OAuth redirect to login.microsoftonline.com
        │
        │  ⚡ Microsoft Entra sees the host's existing session cookies
        │     (top-level browser context — not iframe)
        │     Returns authorization code WITHOUT user prompt
        ▼
[OAuth callback at /api/auth/callback/microsoft-entra-id]
        │
        │  Auth.js exchanges code for session, sets session cookie
        │  redirects to /auth/popup
        ▼
[/auth/popup page]
        │
        │  fetch GET /auth/bridge?popup=true
        ▼
[/auth/bridge?popup=true (server)]
        │
        │  reads Auth.js session cookie from request
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

**Why it works:** the consume response sets `Partitioned` on the cookie, which is what makes it readable inside the cross-context iframe under modern browsers' [CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) policy. See [Compatibility matrix](#compatibility-matrix) for browser support.

The transferStore code is 256-bit hex from `crypto.randomBytes(32)`, single-use, deleted on first read, with a default TTL of 60 seconds. No session token ever appears in a URL.

---

## Compatibility matrix

| Surface | Supported |
|---|---|
| **Next.js** | 14, 15 (App Router; Pages Router planned for v0.2) |
| **Auth.js (next-auth)** | v5 ≥ 5.0.0. v4 not supported in v0.1; planned for v0.2 if demand. |
| **OAuth providers** | Any Auth.js provider that supports authorization-code OAuth: Microsoft Entra, Google, Apple, GitHub, Okta, Auth0-as-IdP. Magic-link / password / WebAuthn-only providers planned for v0.3+. |
| **Browser (iframe)** | CHIPS partitioned cookies: Chrome 114+, Edge 114+, Firefox 130+, Safari 18+. Older Safari supported but cookie persistence may degrade to single session. |
| **TransferStore adapters** | Vercel KV, in-memory (tests). Upstash Redis planned for v0.2. Custom adapters via `TransferStore` interface. |
| **Host applications (iframe)** | Any host page that hosts an iframe and supports `window.open` + `postMessage`. Tested against generic parent pages in CI. Real-host integration (SharePoint web part config, Teams Tab manifest, Salesforce Canvas) is host-side tooling and out of bridge scope. |

---

## Why this, and not...

| Alternative | When it's the right call instead | When it isn't |
|---|---|---|
| **Bare iframe sign-in (no bridge)** | Your users don't already have a session at the host — they need to sign in fresh inside the iframe anyway | The host already has the user signed in. Forcing a redundant login is bad UX. |
| **Storage Access API (`document.requestStorageAccess()`)** | You can accept a permission prompt | UX prompt is unacceptable. Also, it has uneven cross-browser support. |
| **Pure CHIPS partitioned cookies (no popup bridge)** | Your iframe can do its own independent auth from scratch | You want to inherit the host's existing identity-provider session silently |
| **Microsoft Teams Tab SDK with `notifySuccess`** | Your iframe is ONLY in Teams Tab and you're OK with the SDK lock-in | You want one auth flow that works in SharePoint, Salesforce, ServiceNow, etc. — not just Teams |
| **Vendor SDK (Auth0 SDK, Okta SDK, Clerk SDK)** | You're using that vendor's hosted identity (not Auth.js) | You're on Auth.js. This package is the Auth.js-shaped equivalent. |
| **`expo-auth-session`** | You're using Expo Router | You're on Next.js. This package is Next.js / Auth.js-specific. |

---

## Threat model

Short version. Full discussion in [docs/threat-model.md](./docs/threat-model.md).

- **Code entropy.** 256-bit (32-byte) CSPRNG output from `crypto.randomBytes(32).toString('hex')`. Stored in `transferStore`, exposed only as an opaque URL parameter for at most one round-trip.
- **TTL + one-time use.** Default 60 s. Deleted on first read. Replay attacks bounded.
- **PKCE.** OAuth flows preserve `code_verifier`/`code_challenge` across the bridge handoff. Without PKCE, an attacker intercepting the OAuth code in transit could exchange it.
- **No session token in URL.** Only the opaque handle travels through URLs. The actual Auth.js session cookie is set by the server response, never visible to JavaScript or URL logs.
- **CSRF on `/auth/consume`.** Codes are one-time-use; second call returns 4xx. Origin checked when handle arrives via `postMessage`.
- **`sanitizeRedirects`.** `next` parameter rejected if starts with `/auth`, `/api/auth`, or `/auth/consume`. Prevents auth-loop and open-redirect attacks.
- **Wrapper / iframe detection is UX routing, not security.** A forged context-detection signal in a normal browser must not exfiltrate a session. `/auth/bridge` independently checks for an actual Auth.js session before minting a handle.
- **`postMessage` origin checks.** Both popup and opener verify `event.origin === window.location.origin`. Mismatches are dropped silently.
- **Partitioned cookie.** Cookie is set with `Partitioned` attribute → CHIPS-compliant. Cross-context iframe can read its own partition; other iframes on the same domain under different partition keys cannot.

---

## Examples

- [`examples/tenant-app`](./examples/tenant-app) — **Recommended starting point.** The embedded Next.js app demonstrating the popup-bridge flow end-to-end against a real Microsoft Entra app registration, deployed to a Vercel preview. Multi-tenant pattern with per-tenant configuration.
- [`examples/host-shell`](./examples/host-shell) — the host page that embeds the tenant app in a cross-site iframe, so the CHIPS handoff can be exercised across two real origins.

A minimal popup-only example app is planned for v0.2.

---

## Roadmap

### v0.1.0 (current target)

- Popup-bridge transport (Mode A) for Next.js apps embedded in enterprise iframes
- Auth.js v5 integration, App Router
- TransferStore: Vercel KV adapter (production) + in-memory adapter (tests)
- Provider-agnostic proof: Microsoft Entra in reference deployment + generic OIDC (Keycloak / Auth.js test provider) in CI
- Multi-tenant reference example deployed to Vercel preview
- Threat model documented; every Mode A invariant has a passing negative-case Vitest
- semantic-release pipeline, Conventional Commits, commit-msg hook, branch protection on `main`
- Auth.js docs recipe PR opened against authjs.dev

### v0.2

- **Mode B transport** — `ASWebAuthenticationSession`-based bridge for Next.js apps wrapped as native iOS via [PWABuilder's pwa-shell](https://github.com/pwa-builder/pwabuilder-ios). Unlocks passkeys in iCloud Keychain, autofill, Sign in with Apple, and saved credentials inside the wrapper. Additive on the v0.1 transferStore — no breaking changes for v0.1.0 consumers.
- Upstash Redis adapter (second non-Vercel proof of the pluggable interface)
- Minimal popup-only example app for Teams Tab / SharePoint iframe scenarios without PWA wrapping
- Pages Router support
- Auth.js v4 (legacy NextAuth) support — if community demand
- Android (Bubblewrap / TWA) — investigated; may "just work" via Chrome Custom Tabs

### v0.3+

- Magic-link providers (handle-based mint without OAuth code)
- Password providers (same)
- WebAuthn-only providers (server-side credential mint)
- Capacitor / Cordova wrappers (different JS bridge mechanism)
- Other Next.js auth libraries (Clerk, Auth0-via-Next.js-package)

### Out of scope (not on roadmap)

- Generic "auth library for all native wrappers" — see [`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/) if that's what you need.
- Replacement for Auth.js. This package wraps and complements Auth.js; it does not redo OAuth.

---

## Contributing

Issues and discussions welcome at [GitHub](https://github.com/<owner>/next-auth-bridge). PRs require:

- A test for the change (Vitest).
- An update to the relevant section in [docs/threat-model.md](./docs/threat-model.md) if security-relevant.
- A changeset describing the impact for users.

Engineering decisions are documented in PR descriptions and in [docs/release-governance.md](./docs/release-governance.md) and [docs/threat-model.md](./docs/threat-model.md).

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Acknowledgments

Built on top of [Auth.js](https://authjs.dev/) (which it complements, not replaces). Cross-context cookie handling follows the [CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) specification. Mode B (planned for v0.2) will implement [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) using Apple's [ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession) API.
