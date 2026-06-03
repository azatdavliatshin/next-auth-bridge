# next-auth-bridge

**Cross-context auth for Next.js apps with Auth.js — one bridge, two transports.**

Sign a user in once. Reuse that session inside an `<iframe>` embedded in MS SharePoint or Teams Tab (CHIPS-partitioned cookie via popup). Reuse it again inside a PWABuilder-wrapped iOS app (`ASWebAuthenticationSession` + custom URL scheme deep link, with passkeys / Sign in with Apple / autofill working natively). All under one `transferStore`-backed bridge.

```bash
pnpm add next-auth-bridge
# requires: next ≥ 14, next-auth (Auth.js) ≥ 5, a server-side KV store
```

> Status: pre-release. APIs are unstable until v0.1.0. Not yet on npm. See [Roadmap](#roadmap).

---

## Table of contents

- [Why this exists](#why-this-exists)
- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Mode A — Enterprise iframe-SSO](#mode-a--enterprise-iframe-sso)
- [Mode B — PWABuilder iOS wrapper](#mode-b--pwabuilder-ios-wrapper)
- [Compatibility matrix](#compatibility-matrix)
- [Why this, and not...?](#why-this-and-not)
- [Threat model](#threat-model)
- [Examples](#examples)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why this exists

Two real cross-context auth problems for Next.js apps in 2026:

**The iframe problem.** Your Next.js app is embedded in a host application — MS SharePoint, Teams Tab, Salesforce Lightning, ServiceNow, Confluence/Jira, a custom enterprise portal. The host already has the user signed in to the shared identity provider (typically Microsoft Entra). But Safari ITP, Chrome 3rd-party-cookie deprecation, and Firefox ETP block the iframe from seeing the host's cookies. From the user's perspective they're already signed in; from your iframe's perspective they're anonymous.

**The PWA-wrapper problem.** You ship your Next.js app as a native iOS application by wrapping it with [PWABuilder's pwa-shell](https://github.com/pwa-builder/pwabuilder-ios). Inside the `WKWebView`, you have an isolated cookie jar that doesn't share with system Safari. Saved credentials, autofill, Sign in with Apple, and most painfully — **passkeys in iCloud Keychain** — are all unreachable.

Both problems sit on the same architectural shape: a primary auth session lives in one context, and a secondary context needs to mint a session cookie of its own without re-prompting the user. This library solves both with **one set of route handlers and one** `transferStore`, dispatched through **two transports**.

---

## Quick start

### 1. Install

```bash
pnpm add next-auth-bridge
```

### 2. Configure the bridge

```ts
// lib/auth-bridge.ts
import { createBridgeConfig } from 'next-auth-bridge';
import { VercelKVStore } from 'next-auth-bridge/stores/vercel-kv';

export const bridgeConfig = createBridgeConfig({
  // Auth.js provider id used to initiate OAuth
  authProvider: 'microsoft-entra-id',

  // Native callback URL scheme registered in your pwa-shell Info.plist
  // (only needed if you target Mode B / iOS)
  nativeCallbackScheme: 'msauth.com.example.app',

  // Server-side TTL'd KV; built-in adapters for Vercel KV, Upstash Redis, in-memory (tests)
  store: new VercelKVStore({ ttl: 60 }),

  // Wrapper / iframe detection signals
  detection: {
    // Server-readable cookie set by your pwa-shell on WKWebView init (Mode B detection)
    platformCookie: 'pwa-platform',
    // UA fallback for Mode B
    userAgentPattern: /PWAShell/,
  },

  // Where /auth/consume is allowed to redirect after success.
  // Paths inside /auth or /api/auth always rejected to prevent auth-loops.
  sanitizeRedirects: { fallback: '/' },
});
```

### 3. Wire up the route handlers

```ts
// app/auth/bridge/route.ts
export { GET } from 'next-auth-bridge/server/bridge';
```

```ts
// app/auth/consume/route.ts
export { GET } from 'next-auth-bridge/server/consume';
```

### 4. Add helper pages for both transports

```tsx
// app/auth/popup/page.tsx — used by Mode A (iframe-SSO)
export { PopupPage as default } from 'next-auth-bridge/pages/popup';
```

```tsx
// app/auth/native-signin/page.tsx — used by Mode B (PWA wrapper)
export { NativeSignInPage as default } from 'next-auth-bridge/pages/native-signin';
```

### 5. Trigger the right flow from your sign-in page

```tsx
// app/auth/page.tsx
'use client';

import { getSession, signIn } from 'next-auth/react';
import { useEffect } from 'react';
import { detectContext, openAuthPopup } from 'next-auth-bridge/client';

export default function SignInPage() {
  const callbackUrl = '/'; // or read from search params

  useEffect(() => {
    getSession().then(session => {
      if (session) {
        window.location.href = callbackUrl;
        return;
      }

      const ctx = detectContext();

      if (ctx === 'pwa-shell') {
        // Mode B — hand off to native ASWebAuthenticationSession
        window.location.href = `/auth/native-signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        return;
      }

      if (ctx === 'iframe') {
        // Mode A — open popup; user does NOT see a prompt if host SSO is active
        openAuthPopup({ callbackUrl }).then(success => {
          if (success) window.location.reload();
        });
        return;
      }

      // Regular browser — standard Auth.js flow
      signIn('microsoft-entra-id', { redirectTo: callbackUrl });
    });
  }, []);

  return <Loader />;
}
```

That's the minimal integration. See [`examples/nextjs-app-router-multi-tenant`](./examples/nextjs-app-router-multi-tenant) for a complete reference app showing all three contexts (web, embedded-iframe, wrapped-PWA) under one codebase, including dynamic per-tenant manifest and a public install-pwa landing page for PWABuilder.

---

## How it works

Both modes go through `/auth/bridge` → `transferStore` → `/auth/consume`. The only thing that differs is **how the one-time code travels from bridge to consume**:

```
                       ┌────────────────────────────────────────────┐
                       │  Shared infrastructure (server-side)       │
                       │                                            │
                       │  /auth/bridge        →   transferStore     │
                       │  256-bit hex code        TTL = 60 s        │
                       │  one-time-use            keyed by code     │
                       │                              │             │
                       │  /auth/consume      ←────────┘             │
                       │  sets cookie + redirects/responds          │
                       └────────────────────────────────────────────┘
                              ▲                            │
            transport A: postMessage           transport B: OS-routed deep-link
            (popup ↔ opener)                   (ASWebAuthenticationSession callback)
                              │                            │
                  ┌───────────┴────────┐         ┌─────────┴─────────┐
                  │  Mode A (iframe)   │         │  Mode B (PWA)     │
                  │  partitioned cookie │         │  regular cookie   │
                  │  CHIPS-compliant    │         │  HttpOnly+Secure  │
                  └────────────────────┘         └───────────────────┘
```

The `transferStore` is the only state shared between the two transports. Codes are 256-bit hex from `crypto.randomBytes(32)`, single-use, deleted on first read, with a default TTL of 60 seconds.

---

## Mode A — Enterprise iframe-SSO

**When to use:** your Next.js app is iframe-embedded inside a host application that already has user identity (MS SharePoint web part, Teams Tab, Salesforce Lightning component, ServiceNow custom UI, Confluence/Jira app, any enterprise portal with SSO).

**The flow:**

```
[host page in SharePoint with active Microsoft Entra session]
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

**User-visible UX:** popup window appears for under a second and closes. No login prompt if the host SSO is active. To the user, the iframe simply "becomes signed in".

**Critical:** the consume response sets `Partitioned` on the cookie, which is what makes it readable inside the cross-context iframe under modern browsers' [CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) policy. See [Compatibility matrix](#compatibility-matrix) for browser support.

---

## Mode B — PWABuilder iOS wrapper

**When to use:** your Next.js app is wrapped as a native iOS app via [PWABuilder's pwa-shell](https://github.com/pwa-builder/pwabuilder-ios). You want passkeys, autofill, Sign in with Apple, and saved credentials to work inside the wrapper.

### Native side (already in pwa-shell)

The pwa-shell template already implements the [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) "OAuth 2.0 for Native Apps" pattern using `ASWebAuthenticationSession`. You don't write Swift; you configure pwa-shell with two values:

```swift
// In your pwa-shell config (see docs/pwa-shell-setup.md for the exact file)
let nativeSignInPath = "/auth/native-signin"  // path that triggers the bridge
let callbackURLScheme = "msauth.com.example.app"  // matches your Info.plist
let authOrigins = [
    "login.microsoftonline.com",
    "login.live.com",
    // ... your OAuth provider's hosts
]
```

You also register `msauth.com.example.app://` in your `Info.plist` `CFBundleURLTypes`. See [docs/pwa-shell-setup.md](./docs/pwa-shell-setup.md) for the full snippet.

### The flow

```
[user opens wrapped iOS app]
        │
        │  WKWebView loads start_url from PWA manifest
        ▼
[Next.js app in WKWebView — no session]
        │
        │  detection: navigator.platform === 'iOS-PWAShell' OR UA contains 'PWAShell'
        │  middleware redirects to /auth (sign-in page)
        ▼
[sign-in page]
        │
        │  detectContext() === 'pwa-shell'
        │  window.location.href = '/auth/native-signin?callbackUrl=...'
        ▼
[WKNavigationDelegate.decidePolicyFor in native shell]
        │
        │  matches path prefix /auth/native-signin
        │  decisionHandler(.cancel)
        │  opens ASWebAuthenticationSession(
        │    url: <the same URL>,
        │    callbackURLScheme: "msauth.com.example.app"
        │  ) with prefersEphemeralWebBrowserSession = false
        ▼
[ASWebAuthenticationSession sheet — Safari-shared context]
        │
        │  Safari session cookies, autofill, iCloud Keychain available
        │  → passkeys work, Sign in with Apple works, saved credentials work
        │
        │  Auth.js signIn('microsoft-entra-id')
        │  OAuth redirect to login.microsoftonline.com (matches authOrigins)
        │  user authenticates (passkey, biometric, etc.)
        │  OAuth callback to /api/auth/callback/...
        │  Auth.js sets session cookie INSIDE the session sheet's context
        │  redirects to /auth/bridge?next=<callbackUrl>
        ▼
[/auth/bridge?next=... (server, called inside session sheet)]
        │
        │  reads session cookie from request
        │  generates 256-bit handle, stores in transferStore
        │  redirects to: msauth.com.example.app://auth?code=<handle>&next=<callbackUrl>
        ▼
[OS captures the custom-scheme redirect, dismisses session sheet]
        │
        │  callback handler in native shell receives callbackURL
        │  extracts code + next
        │  loads <rootUrl>/auth/consume?code=...&next=... in WKWebView
        ▼
[/auth/consume?code=... (server, called inside WKWebView)]
        │
        │  looks up code in transferStore, deletes (one-time-use)
        │  validates `next` via sanitizeRedirects
        │  302 redirect to `next` with Set-Cookie:
        │    name=<session-token>; HttpOnly; Secure; SameSite=None
        ▼
[WKWebView lands on `next`, authenticated]
```

**Critical detail:** `prefersEphemeralWebBrowserSession = false` (the pwa-shell default) is what unlocks passkeys. Setting it to `true` would isolate the session from Safari and break iCloud Keychain access — a common mistake.

---

## Compatibility matrix

| Surface | Supported |
|---|---|
| **Next.js** | 14, 15 (App Router primary; Pages Router supported via separate exports) |
| **Auth.js (next-auth)** | v5 ≥ 5.0.0. v4 not supported in v1; planned for v0.2 if demand. |
| **OAuth providers** | Any Auth.js provider that supports authorization-code OAuth: Microsoft Entra, Google, Apple, GitHub, Okta, Auth0-as-IdP. Magic-link / password / WebAuthn-only providers — v0.3+. |
| **Mode A (iframe) browsers** | CHIPS partitioned cookies: Chrome 114+, Edge 114+, Firefox 130+, Safari 18+. Older Safari supported but cookie persistence degrades to single session. |
| **Mode B (iOS wrapper)** | iOS 16+ (ASWebAuthenticationSession passkey UI). iOS 17+ recommended (most stable passkey flow). |
| **pwa-shell** | Latest main as of 2026-Q2. Pinned minimum version documented in [docs/pwa-shell-setup.md](./docs/pwa-shell-setup.md). |
| **TransferStore adapters** | Vercel KV, Upstash Redis, in-memory (tests). Custom adapters via `TransferStore` interface. |

---

## Why this, and not...

| Alternative | When it's the right call instead | When it isn't |
|---|---|---|
| **Bare WKWebView auth (just sign in inside the wrapper)** | You don't need passkeys, autofill, or Sign in with Apple — you're OK forcing users to type credentials | Most of the time. The UX gap is large. |
| **Storage Access API (`document.requestStorageAccess()`)** | You can ask the user for a permission prompt and your host is iframe-only (not a PWA wrapper) | UX prompt is unacceptable; doesn't help PWA wrappers at all |
| **Pure CHIPS / partitioned cookies (no popup bridge)** | Your iframe can do its own auth from scratch — no need to inherit the host's session | You need the SSO inheritance flow (the common case) |
| **Universal Links + KV-handle (no ASWebAuthenticationSession)** | You're not on iOS, or pwa-shell's ASWebAuthenticationSession isn't an option | Heavier setup (apple-app-site-association, Associated Domains entitlement, "Open in App" prompt). When pwa-shell is available, ASWebAuthenticationSession is cleaner. |
| **AppAuth library** | Native iOS app written from scratch where you control all native code | You're using pwa-shell for distribution; AppAuth isn't shaped for Next.js + Auth.js integration |
| **`expo-auth-session`** | You're using Expo Router | You're not. This package is Next.js / Auth.js-specific. |
| **Microsoft Teams Tab SDK with `notifySuccess`** | Your iframe is ONLY in Teams Tab and you're OK with the SDK lock-in | You want one auth flow that works in SharePoint, Salesforce, ServiceNow, etc. — not just Teams |
| **Vendor SDK (Auth0 SDK, Okta SDK, Clerk SDK)** | You're using that vendor's hosted identity (not Auth.js) | You're on Auth.js. This package is the Auth.js-shaped equivalent. |

---

## Threat model

Short version. Full discussion in [docs/threat-model.md](./docs/threat-model.md).

- **Code entropy.** 256-bit (32-byte) CSPRNG output from `crypto.randomBytes(32).toString('hex')`. Stored in `transferStore`, never exposed beyond URL parameter for at most one round-trip.
- **TTL + one-time use.** Default 60 s. Deleted on first read. Replay attacks bounded.
- **PKCE.** OAuth flows preserve `code_verifier`/`code_challenge` across the bridge handoff. Without PKCE, an attacker intercepting the OAuth code in transit could exchange it.
- **No session token in URL.** Only the opaque handle travels through URLs. The actual Auth.js session cookie is set by the server response, never visible to JavaScript or URL logs.
- **CSRF on `/auth/consume`.** Codes are one-time-use; second call returns 4xx. Origin checked when handle arrives via `postMessage`. PKCE-bound when handle arrives via deep link.
- **`sanitizeRedirects`.** `next` parameter rejected if starts with `/auth`, `/api/auth`, or `/auth/consume`. Prevents auth-loop and open-redirect attacks.
- **Wrapper detection is UX routing, not security.** A forged `platformCookie` or `iOS-PWAShell` UA in a normal browser must not exfiltrate a session. `/auth/bridge` independently checks for an actual Auth.js session before minting a handle.
- **`postMessage` origin checks.** Both popup and opener verify `event.origin === window.location.origin`. Mismatches are dropped silently.
- **Partitioned cookie in Mode A.** Cookie is set with `Partitioned` attribute → CHIPS-compliant. Cross-context iframe can read its own partition; other iframes on the same domain under different partition keys cannot.
- **`callbackURLScheme` registration (Mode B).** Custom scheme is registered in Info.plist `CFBundleURLTypes`. OS routes the callback to ASWebAuthenticationSession's scope only — not to other apps.

---

## Examples

- [`examples/nextjs-app-router-multi-tenant`](./examples/nextjs-app-router-multi-tenant) — **Recommended starting point.** End-to-end reference app showing all three contexts under one Next.js codebase: web (regular browser), wrapped-PWA (iOS via pwa-shell), and embedded-iframe (SharePoint-style). Includes dynamic per-tenant PWA manifest and a public install-pwa landing page that PWABuilder consumes.

- [`examples/nextjs-app-router-minimal`](./examples/nextjs-app-router-minimal) — Stripped-down example using **only Mode A** (popup for iframe / Teams Tab). No PWA wrapping, no native iOS code. The fastest path if your only target is enterprise iframe embeds.

---

## Roadmap

### v0.1 (current target, planning phase)

- Mode A (popup / iframe-SSO) — Auth.js v5, App Router
- Mode B (PWAShell / pwa-shell) — iOS only
- TransferStore adapters: Vercel KV, Upstash, in-memory
- Reference examples (multi-tenant, minimal)
- Threat model documented

### v0.2

- Pages Router support
- Auth.js v4 (legacy NextAuth) support
- Android (Bubblewrap / TWA) — likely a thinner adapter, may "just work" via Chrome Custom Tabs

### v0.3+

- Magic-link providers (handle-based mint without OAuth code)
- Password providers (same)
- WebAuthn-only providers (server-side credential mint)
- Capacitor / Cordova wrappers (different JS bridge mechanism)
- Other Next.js auth libraries (Clerk, Auth0-via-Next.js-package)

### Out of scope (not on roadmap)

- Generic "auth library for all native wrappers" — see `expo-auth-session` if you need that.
- Replacement for Auth.js. This package wraps and complements Auth.js; it does not redo OAuth.

---

## Contributing

Issues and discussions welcome at [GitHub](https://github.com/<owner>/next-auth-bridge). PRs require:

- A test for the change (Vitest).
- An update to the relevant section in [docs/threat-model.md](./docs/threat-model.md) if security-relevant.
- A clear changeset describing the impact for users.

The project is built using [GSD](https://github.com/open-gsd/gsd-core) (spec-driven development for Claude Code). Plan / requirements / state files live under `.plans/` and are committed — see them for the engineering decisions behind the current shape.

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Acknowledgments

Built on top of [Auth.js](https://authjs.dev/) (which it complements, not replaces). Implements [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) on the iOS transport, using Apple's [ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession) API. Cross-context cookie handling follows the [CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) specification.
