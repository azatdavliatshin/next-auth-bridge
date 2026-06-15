# Phase 3: Client Helpers, Pages & Middleware - Research

**Researched:** 2026-06-08
**Domain:** Browser cross-context auth (popup + iframe), Web `postMessage` security, CHIPS partitioned cookies, Next.js middleware, pure-Node DI test design
**Confidence:** HIGH (the five load-bearing mechanism questions D-14/D-09/D-16/D-02/D-11 are all confirmed against primary specs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

The full D-01..D-16 set plus amendments is locked in `03-CONTEXT.md`. The planner MUST honor these verbatim. Summary of the binding ones for planning:

- **D-01** — The **opener** (the embedded iframe app), not the popup, drives `/auth/consume`, so the CHIPS partitioned cookie lands in the **iframe's** partition. The `{ code }` crosses the `postMessage` trust boundary as a bearer handle.
- **D-02** — `postMessage` channel: popup posts with an **explicit `targetOrigin`** (never `'*'`). Opener verifies **`event.origin ∈ allowedOrigins` AND `event.source === ` the opened popup `Window`**. Both required. No nonce.
- **D-03** — Namespaced discriminated-union message payload: `{ source: 'next-auth-bridge', type: 'auth-success', code }` / `{ source: 'next-auth-bridge', type: 'auth-error', reason }`.
- **D-04** — `openAuthPopup(...)` returns a **promise**: resolves `{ code }` on `auth-success`; rejects on `auth-error`, popup-closed (poll `window.closed`), and timeout. Typed/distinguishable rejection reasons. Cleans up listener + close-poll on settle.
- **D-05** — `detectContext` uses `window.self !== window.top` wrapped in try/catch (a cross-origin throw on `window.top` itself confirms embedding → `'iframe'`). No host heuristics.
- **D-06** — `detectContext` is **client-only** (guards on `window`). The middleware does its own server-side inference (D-09). Two detectors, one per environment.
- **D-07** — Return type stays the **wide open union** `'iframe' | 'browser' | 'pwa-shell'`. Callsites use **if/else with a default (`browser`)**, never an exhaustive switch / `never` assertion. Documented at the type AND each callsite. **Amend:** comments must be **self-contained** about *why* the union is open and **MUST NOT cite internal requirement IDs** (`CLIENT-03` etc.) — those are `.planning`-only and would be dangling refs in the published package.
- **D-08** — Middleware: unauth **embedded** request to a protected path → route toward the popup-bridge entry; unauth **browser** request → normal Auth.js redirect. **Amend:** the embedded-routing mechanism is `NextResponse.rewrite` (URL unchanged), **not** a redirect. All non-embedded-unauth cases → passthrough (`next()`/`undefined`); app owns `config.matcher`.
- **D-09** — Server-side embedded signal = **`Sec-Fetch-Dest: iframe`**. Absent/unknown → default to `browser`.
- **D-10** — Export a `createBridgeMiddleware(options)` factory returning a Web-standard middleware fn. UX-only: chooses **WHERE** to route an already-unauthenticated request, never **WHETHER** to allow access. **Amend:** add a **structural assertion** that the middleware module contains no `verifySession` call and no store access; the behavioural test varies only the detection signal at a fixed auth state and asserts the security outcome is invariant — only the UX target changes.
- **D-11** — First iframe→bridge→consume→partitioned-cookie roundtrip on the **existing pure-Node Vitest bench** (no jsdom). Drive real `bridge`/`consume` handlers with plain `Request`s; model the popup↔opener `postMessage` handoff as a **function-level simulation**. **Amend:** the bench asserts data-flow + the `Partitioned` attribute **emission** only — NOT real CHIPS partition **enforcement** (Phase 4 manual/browser).
- **D-12** — Client helpers take browser deps via **parameters/options** (injected `open`, `addEventListener`/`postMessage`, `window`-like object) — no global `window` in tests. Mirrors the Phase 1 clock seam. **Amend:** factor the wrong-origin/wrong-source check into a **pure predicate** `isTrustedMessage(event, { allowedOrigins, expectedSource }): boolean` taking a plain `MessageEvent`-shaped object, so THREAT-03 runs with zero DOM and zero globals.
- **D-13** — v0.1 **package** ships only the framework-agnostic, DI-testable `runPopupFlow(deps)` — **no `.tsx`, no React, no JSX config**. The actual `/auth/popup` page lives in the Phase 5 example app. Intentional, recorded deviation from the `popup-page.tsx` CLAUDE.md pointer.
- **D-14** — Consume invocation mode (fetch vs navigate): the decisive CHIPS question. **RESOLVED by this research → prefer `fetch` (credentials: 'include').** See the dedicated section below.
- **D-15** — URL-hygiene: the property is **"the Auth.js session *token* never appears in any URL"**. The opaque one-time **handle** (`code`) is a different artifact and MAY appear in the `/auth/consume` request URL. THREAT-07 must assert the former, NOT forbid `?code=`.
- **D-16** — `createBridgeMiddleware` and its **entire transitive import graph** MUST be edge-safe: no transfer store, no `@upstash/redis`, no `node:crypto`, no Node-only API. Separate, lightweight export — NOT bundled into `createAuthBridge`. **RESOLVED/REFINED by this research** — see the Next.js middleware section (runtime landscape changed in Next 15.5/16).

### Claude's Discretion

- Exact public export names + file layout under `packages/core/src/` (e.g. `popup-flow.ts`, `open-auth-popup.ts`, `detect-context.ts`, `middleware.ts`, `is-trusted-message.ts`).
- Exact `openAuthPopup` timeout default; `window.open` features / popup URL construction (behavior locked: reject on timeout, no token in URL).
- Single `deps` object vs individual params for the DI seam (invariant: no global `window` in tests).
- Exact rewrite/redirect mechanics per context; how it composes with the app's `config.matcher` / Auth.js middleware (invariant: embedded → popup entry via rewrite, browser → normal redirect, never a security gate).
- Whether `detectContext`'s `'pwa-shell'` arm needs any v0.1 code (likely type-level member + default-fallback test only).

### Deferred Ideas (OUT OF SCOPE)

- The actual `/auth/popup` `.tsx` React component → Phase 5 example app (D-13).
- `native-signin-page.tsx` / any Mode B client surface → v0.2. `'pwa-shell'` is a type-level forward-compat stub only.
- jsdom / happy-dom DOM-realistic client tests → rejected for v0.1 (D-12); DI seam tests pure-Node.
- Nonce / handshake-token on the `postMessage` channel → rejected (D-02).
- Host-specific embedded detection (`document.referrer`, `ancestorOrigins`, per-host heuristics) → rejected (D-05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLIENT-01 | `/auth/popup` client page completes the popup flow and signals the opener via `postMessage` | v0.1 ships `runPopupFlow(deps)` only (D-13). MDN postMessage confirms explicit `targetOrigin` is required (never `'*'`). Bridge contract: `fetch('/auth/bridge')` → `200 { code }` (verified against `bridge-route.ts`). |
| CLIENT-02 | `openAuthPopup` opens the popup and enforces `postMessage` origin checks on receipt (THREAT-03) | MDN confirms the receiver must validate `event.origin` (allowlist) AND `event.source` (=== opened popup `Window`). Pure predicate `isTrustedMessage` (D-12 amend) makes this testable with zero DOM. |
| CLIENT-03 | `detectContext` returns an open-union (forward-compat) discriminating context | Acceptance: public type is `'iframe' \| 'browser' \| 'pwa-shell'`; callsites use default-fallback (D-07), not exhaustive switch. Confirmed correct TS pattern below. |
| CLIENT-04 | Middleware routes by detected context (UX routing only, not a security gate) | `Sec-Fetch-Dest: iframe` confirmed: browser-set, `Sec-`-prefixed **forbidden request header** (unspoofable by page JS), emitted for sub-frame document loads, Baseline-widely-available since Mar 2023. `NextResponse.rewrite` keeps URL unchanged (confirmed). The real gate stays Phase 2 `verifySession`. |
| CLIENT-05 | Client-side URL hygiene — no session token in any URL the client constructs (THREAT-07) | Bridge returns the handle in the JSON body (Phase 2 D-07, verified zero `Set-Cookie`, no URL). Token lives only in the consume `Set-Cookie`. D-15 token-vs-handle distinction grounds the assertion. |
</phase_requirements>

## Summary

This phase is **pure mechanism wiring**, not library selection. It adds **zero new runtime dependencies** — every helper is a framework-agnostic, dependency-injected, pure-Node function tested on the existing Vitest `environment: "node"` bench (D-11/D-12/D-13). The research effort therefore went entirely into grounding the five load-bearing browser/spec questions the locked decisions flagged, against primary sources. All five are confirmed.

**The decisive item (D-14) is resolved in favor of `fetch`.** The CHIPS specification and explainer state the partition key is "the site of the top-level URL the browser was visiting **at the start of the request**" and that this applies **uniformly to fetch/subresource requests and navigations** — there is **no requirement that a partitioned cookie be set via a top-level navigation**. A credentialed cross-site `fetch` issued from inside the iframe lands the `Partitioned` `Set-Cookie` in the partition keyed by the **top-level (host) site** — exactly the iframe's partition Mode A needs. `fetch` is therefore preferred: it keeps the opaque handle out of the URL (aligns with Phase 2 D-07's no-handle-in-URL ethos and D-15) and preserves the iframe's SPA state. The residual risk is purely a *testing-honesty* one, already captured by D-11: the pure-Node bench cannot model real partition enforcement, so the bench asserts attribute **emission** only and real isolation is a Phase 4 browser check.

**Primary recommendation:** Build four pure functions + one pure predicate, all DI-seamed, all pure-Node. Drive consume via **GET `fetch(.../auth/consume?code=...&next=...)` with `credentials: 'include'` and `redirect: 'follow'`** from the opener (no Phase 2 route change needed — consume already reads `code`/`next` from the query and 302s). Export `createBridgeMiddleware` as a **separate, store-free, crypto-free module**. Note one currency finding for the planner: as of **Next.js 15.5 (stable) / 16.0**, middleware (now renamed **`proxy`**) can run in the **Node.js runtime** and in v16 defaults to it — so D-16's "edge-safe" constraint is now a *portability guarantee* (keep it edge-safe so it works in either runtime) rather than a hard requirement of the platform.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Run silent-auth + fetch `{ code }` + post to opener (`runPopupFlow`) | Browser / Client (popup top-level context) | — | Must run in the popup's top-level browser context to silent-auth via the host IdP session and read `window.opener`. |
| Open popup, receive + validate message, resolve `{ code }` (`openAuthPopup`) | Browser / Client (iframe/opener context) | — | DOM `window.open` + `message` listener live only in the embedded app's client. |
| `event.origin`/`event.source` trust check (`isTrustedMessage`) | Pure logic (extracted from Client) | — | Security predicate; deliberately pure so it is tested with zero DOM (D-12 amend). |
| Drive `/auth/consume` so cookie lands in iframe partition | Browser / Client (iframe) | API / Backend (Phase 2 consume) | D-01: the opener's fetch carries the request whose top-level site keys the CHIPS partition. |
| `detectContext` (iframe vs browser) | Browser / Client | — | `window.self !== window.top` is a client-only signal (D-06). |
| Context-routing middleware (`createBridgeMiddleware`) | Frontend Server (Next.js middleware/proxy) | — | Server-side `Sec-Fetch-Dest` inference + `rewrite`; runs before the route renders. Must NOT import the API/store tier (D-16). |
| Session gate / handle mint / cookie set | API / Backend (Phase 2) | — | Unchanged. The real security boundary stays in `/auth/bridge` + the one-time handle. Phase 3 never re-implements it. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | — | All Phase 3 helpers are hand-rolled pure functions | D-11/D-12/D-13 lock the package to zero new runtime deps and React-free for v0.1. The entire surface is Web-standard `Request`/`Response`/`postMessage`/`window` shapes, injected as fakes in tests. |

### Supporting (already present — dev/peer only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^4.1.8` (dev) | Test bench (`environment: "node"`, `include: src/**/*.test.ts`) | All Phase 3 tests; reuse the existing config unchanged. |
| `typescript` | `^5` (dev) | `strict: true`, no `any` outside test scaffolding | Open-union type (D-07), `MessageEvent`-shaped types for the predicate. |
| `next` (peer, app-side only) | `15.5+` / `16.x` | Middleware/`proxy` host | **Do NOT add as a runtime dep of the core package.** The middleware factory returns a Web-standard fn; the app wires it into its `middleware.ts`/`proxy.ts`. Types may be referenced via a thin `NextRequest`-shaped structural type to avoid coupling (mirrors the D-04 "no concrete Auth.js type imported" pattern). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hard-navigate the iframe to `/auth/consume` (GET, handle in URL) | `fetch('/auth/consume?...', { credentials: 'include', redirect: 'follow' })` | **Research resolves to fetch.** Navigate puts the handle in history/`Referer`/logs and unloads SPA state; fetch keeps the handle out of the URL and preserves state, and CHIPS confirms the partitioned cookie still lands in the top-level-keyed partition. Navigate remains a documented fallback if a future browser quirk breaks redirect-hop `Set-Cookie` in fetch. |
| POST-fetch with the code in the request body | GET-fetch with `?code=` in the query | Either works for partition placement. GET requires **no Phase 2 change** (consume already reads `code`/`next` from the query — verified in `consume-route.ts`). D-15 explicitly permits the opaque handle in the consume URL. Recommend **GET-fetch** as the minimal-change transport; if the planner wants the handle out of the URL entirely, POST-fetch is an additive Phase 2 follow-up (read `code` from body) — but that is NOT required and expands Phase 2 scope. |
| `addEventListener('message')` via global `window` | Injected `addEventListener`/`postMessage`/`open` deps (D-12) | DI is the established project seam (Phase 1 clock). Global mutation couples tests to `globalThis`. |
| jsdom / happy-dom | Pure-Node DI fakes | D-12 rejected jsdom for v0.1; DI is strictly lighter and the pure predicate needs neither. |

**Installation:**
```bash
# No new packages. Phase 3 adds source files + tests only.
```

## Package Legitimacy Audit

**No external packages are installed in this phase.** Every Phase 3 deliverable is a hand-rolled pure function or a Web-standard handler/predicate, consistent with the package's zero-new-dependency ethos (Phase 1/2 precedent: `cookie-codec.ts`, `auth-helpers.ts` are all hand-rolled). The existing dev/peer deps (`vitest`, `typescript`, `@upstash/redis` optional peer) are unchanged and were vetted in prior phases.

| Package | Registry | Disposition |
|---------|----------|-------------|
| (none) | — | No installs this phase — audit not applicable. |

**Packages removed due to slopcheck [SLOP] verdict:** none (no installs).
**Packages flagged as suspicious [SUS]:** none (no installs).

## The Decisive Item: D-14 — CHIPS, fetch-vs-navigate, and the iframe partition

**Question (from CONTEXT D-14):** Does a `fetch` issued from inside the iframe (`credentials: 'include'`) apply a `Partitioned` `Set-Cookie` carried on the consume **302 redirect hop** into the *fetching context's* (iframe's) partition — or is a **hard top-level navigation** required for the cookie to be written to the iframe partition?

**Answer: a credentialed fetch is sufficient; no top-level navigation is required. Prefer `fetch`.** `[CITED: github.com/privacycg/CHIPS]` `[CITED: developer.mozilla.org/.../Partitioned_cookies]`

### (a) How the partition key is derived — top-level site, request-context-agnostic

The CHIPS spec/explainer states the partition key is computed identically regardless of how the request was issued:

> "A cookie's partition key is the site (i.e. scheme and registrable domain) of the **top-level URL the browser was visiting at the start of the request**." `[CITED: github.com/privacycg/CHIPS]`

MDN states the same and gives the worked example:

> "The partition key is based on the site, including the scheme, of the **top-level URL the browser was visiting when the request was made** to the URL endpoint that set the cookie." — embedded content from `https://3rd-party.example` inside top-level `https://site-a.example` is stored under key `{("https://site-a.example"), ("3rd-party.example")}`. `[CITED: developer.mozilla.org/.../Partitioned_cookies]`

For Mode A, both the iframe app and the host page are the **same host site** (the package targets a Next.js app *embedded as an iframe of itself* inside an enterprise host, single-origin per the Phase 4 single-origin roundtrip). The opener's request to `/auth/consume` is issued while the **top-level site is the host** → the `Partitioned` `Set-Cookie` is keyed to the host's partition, which is exactly the partition the embedded app reads from. The popup must NOT drive consume (D-01) — its top-level site is the popup's own origin, which would key the cookie to the wrong partition.

### (b) fetch/subresource sets partitioned cookies equally — no navigation requirement

> "Yes, partitioned cookies can be set via subresource requests (fetch, XHR, images) from embedded iframes. The cookie stores in the partition keyed by the **top-level site**, not the iframe's origin… The proposal contains **no requirement** that cookies be set only via top-level navigation. Subresource requests work equally well for setting partitioned cookies." `[CITED: github.com/privacycg/CHIPS]`

From Chrome 133 a `Sec-Fetch-Storage-Access` request header is additionally sent with credentialed cross-site requests to inform the server of unpartitioned-cookie access — confirming the credentialed-fetch path is the first-class, supported way to set/read partitioned cookies cross-site. `[VERIFIED: web search — privacysandbox.google.com/cookies/chips]`

### (c) `Set-Cookie` on the redirect hop of a `redirect: 'follow'` fetch is honored

Browsers process `Set-Cookie` as a **side-effect of receiving each response in the redirect chain, before following the redirect** — i.e. the cookie from the 302 is written to the (partitioned) cookie store, then the redirect is followed. With `fetch(..., { redirect: 'follow' })` in a browser the Set-Cookie on the 302 is applied (subject to attribute rules); only `redirect: 'manual'` yields an `opaqueredirect` response that hides headers. `[VERIFIED: web search — multiple sources incl. bugzilla.mozilla.org/1483832, medium/piyalidas]` `[ASSUMED]` for the exact WHATWG-fetch algorithm clause (the spec's HTTP-redirect-fetch step wasn't quotable in-session; behavior is well-established and observable but the precise normative clause is not first-party-cited here).

> **Planner note:** the opener does NOT need the 302 `Location` to auto-navigate the iframe. After the credentialed fetch resolves (the partitioned cookie is now set), the opener performs its own **soft-navigation/re-render to `next`** (D-14's "fetch" branch). The cookie is already in the partition; the subsequent in-app navigation to `next` is now an authenticated request.

### Required cookie attributes (already correct in Phase 2)

CHIPS mandates `Secure`; `SameSite=None` is required for cross-context use; `Path=/` is conventional. Phase 2's `serializeSetCookie` already emits exactly `Path=/; Secure; HttpOnly; SameSite=None; Partitioned` (verified in `cookie-codec.ts`) — **no Phase 3 change needed**. `[CITED: github.com/privacycg/CHIPS]` ("User agent must reject any cookie set with `Partitioned` that does not also include the `Secure`").

### Locked recommendation

- **Transport:** GET `fetch('<host>/auth/consume?code=<handle>&next=<path>', { credentials: 'include', redirect: 'follow' })` from the **opener** (iframe app). No Phase 2 route change.
- **Why fetch over navigate:** keeps the opaque handle out of the URL bar/history/`Referer` where feasible *(note: GET still carries `?code=` in the request URL — that is permitted by D-15; only the session **token** must never appear in a client-constructed URL)*, preserves iframe SPA state, and CHIPS confirms the partitioned cookie still lands in the host partition.
- **Residual risk:** the pure-Node bench cannot prove real partition enforcement (D-11 amend) — it asserts the data flow + `Partitioned` attribute emission only. Real cross-partition isolation is a **Phase 4 manual/browser** check. State this explicitly in the test comments so a green bench is never read as "partitioning works in a browser."

## Architecture Patterns

### System Architecture Diagram

```
  ENTERPRISE HOST PAGE (top-level site = host)
  ┌──────────────────────────────────────────────────────────────────┐
  │  <iframe src="https://host/app">  ← OPENER (embedded Next.js app)  │
  │  ┌────────────────────────────────────────────────────────────┐   │
  │  │ detectContext() → 'iframe'  (window.self !== window.top)    │   │
  │  │ unauth protected route →  [Next middleware: rewrite →       │   │
  │  │                            popup-bridge entry page]         │   │
  │  │                                                             │   │
  │  │ openAuthPopup(deps):                                        │   │
  │  │   open ──────────────► window.open('/auth/popup')  ──────┐  │   │
  │  │   addEventListener('message') ◄───── postMessage ────┐   │  │   │
  │  │   isTrustedMessage(event,{allowedOrigins,            │   │  │   │
  │  │     expectedSource=popupWin})  ── origin+source ─────┤   │  │   │
  │  │   resolve({ code })                                  │   │  │   │
  │  │        │                                             │   │  │   │
  │  │        ▼  fetch('/auth/consume?code&next',           │   │  │   │
  │  │           {credentials:'include', redirect:'follow'})│   │  │   │
  │  │           ───────────────────────────────────────┐  │   │  │   │
  │  └───────────────────────────────────────────────── │ ─┼── │ ─┘   │
  └──────────────────────────────────────────────────── │ ── │ ── │ ──┘
                                                         │    │    │
   POPUP (top-level browser context, own window) ◄───────────┘    │
   ┌─────────────────────────────────────────────┐         │      │
   │ runPopupFlow(deps):                          │         │      │
   │  (host IdP silent-auth already established)   │        │      │
   │  fetch('/auth/bridge') ──► 200 { code } ◄─────┼────────┘      │
   │  opener.postMessage(                          │  (Phase 2     │
   │    {source:'next-auth-bridge',                │   bridge:     │
   │     type:'auth-success', code},               │   session     │
   │    targetOrigin=<host, never '*'>) ───────────┘   gate +      │
   └───────────────────────────────────────────────   mint)       │
                                                                   ▼
                          /auth/consume (Phase 2, UNCHANGED) ──────────┐
                          store.consume(code) → chunks → 302 + per-chunk│
                          Set-Cookie: ...; Secure; SameSite=None;       │
                          Partitioned   ──► lands in HOST partition ────┘
                          (opener then soft-navigates to `next`)
```

A reader can trace the primary use case: embedded unauth request → middleware rewrites to popup-entry → `openAuthPopup` opens `/auth/popup` → `runPopupFlow` silent-auths, fetches `{ code }`, posts it to the opener with an explicit `targetOrigin` → opener validates origin+source → opener fetches `/auth/consume` → partitioned cookie set in the host partition → opener soft-navigates to `next` (now authenticated).

### Recommended Project Structure
```
packages/core/src/
├── detect-context.ts        # detectContext(win?) — client-only, open union (D-05/D-06/D-07)
├── is-trusted-message.ts    # isTrustedMessage(event, opts) — PURE predicate (D-12 amend, THREAT-03)
├── open-auth-popup.ts        # openAuthPopup(deps) — DI seam, promise w/ typed rejections (D-02/D-04/CLIENT-02)
├── popup-flow.ts             # runPopupFlow(deps) — DI seam, fetch bridge + postMessage (CLIENT-01)
├── middleware.ts             # createBridgeMiddleware(options) — store-free, crypto-free (D-08/D-09/D-10/D-16)
├── index.ts                  # extend public surface w/ the four exports + the context type
└── __tests__/
    ├── detect-context.test.ts
    ├── is-trusted-message.test.ts   # THREAT-03 zero-DOM negative cases
    ├── open-auth-popup.test.ts
    ├── popup-flow.test.ts
    ├── middleware.test.ts           # CLIENT-04 forged Sec-Fetch-Dest + structural no-store/no-verifySession assertion
    └── roundtrip.e2e.test.ts        # D-11 iframe→bridge→consume→Partitioned-cookie, pure-Node, function-level postMessage sim
```
(Exact names are Claude's discretion per CONTEXT; the `.tsx` pointers in CLAUDE.md are intentionally not realized in v0.1 — D-13.)

### Pattern 1: Dependency-injection seam for browser globals (D-12)
**What:** Each client helper takes its browser dependencies as parameters, exactly like the Phase 1 clock seam (`now()` in `in-memory.ts`).
**When to use:** Every helper that would otherwise touch `window`, `window.open`, `addEventListener`, or `postMessage`.
**Example:**
```typescript
// Mirrors the Phase 1 clock seam (packages/core/src/transfer-store/in-memory.ts:
//   const { now = Date.now } = options;). Browser deps are injected with sane
// real-browser defaults, and tests pass fakes — no global window required.
interface PopupDeps {
  open: (url: string, target: string, features?: string) => WindowLike | null;
  addMessageListener: (cb: (event: MessageEventLike) => void) => () => void; // returns an unsubscribe
  now?: () => number;
  timeoutMs?: number;
}
// In a real browser the app wires: { open: window.open.bind(window),
//   addMessageListener: (cb) => { window.addEventListener('message', cb);
//     return () => window.removeEventListener('message', cb); } }
```

### Pattern 2: Pure trust predicate, zero DOM (D-12 amend, THREAT-03)
**What:** The origin+source security decision is a pure function over a `MessageEvent`-shaped object — no `window`, no listener, no globals.
**When to use:** The THREAT-03 negative tests assert against this directly; `openAuthPopup` calls it inside its listener.
**Example:**
```typescript
// PURE — strictly stronger than driving the check through an injected window.
// Self-contained doc comment (D-07 amend): no internal requirement IDs in the
// shipped /packages source.
interface MessageEventLike {
  origin: string;
  source: unknown;          // compared by identity to the opened popup Window
  data: unknown;
}
export function isTrustedMessage(
  event: MessageEventLike,
  opts: { allowedOrigins: readonly string[]; expectedSource: unknown },
): boolean {
  // BOTH checks required: origin gates the sender's origin; source identity
  // rejects an unsolicited same-origin sender racing the channel.
  if (!opts.allowedOrigins.includes(event.origin)) return false;
  if (event.source !== opts.expectedSource) return false;
  return true;
}
```

### Pattern 3: Open-union with default-fallback narrowing (D-07, CLIENT-03)
**What:** The return type stays wide; callsites branch with if/else and a default — never an exhaustive `switch`/`assertNever`.
**Example:**
```typescript
// The union is intentionally OPEN: it may gain members in a future minor
// (a native pwa-shell context). Handle the known cases; treat everything else
// as the safe default (browser). NEVER an exhaustive switch / never-assertion —
// a future member must fall through to the default, not become a type error.
export type BridgeContext = "iframe" | "browser" | "pwa-shell";

function routeFor(ctx: BridgeContext): "popup-entry" | "normal" {
  if (ctx === "iframe") return "popup-entry";
  return "normal"; // browser, pwa-shell (v0.2), and any future member
}
```

### Pattern 4: detectContext — try/catch on cross-origin throw (D-05)
```typescript
// Client-only (D-06): guarded on window; the middleware infers separately.
export function detectContext(win: WindowLike = window): BridgeContext {
  try {
    // A cross-origin parent makes `win.top` access THROW — that throw itself
    // confirms embedding. Same-origin top that !== self also confirms iframe.
    if (win.self !== win.top) return "iframe";
    return "browser";
  } catch {
    return "iframe"; // SecurityError on cross-origin top === embedded
  }
}
```

### Pattern 5: Store-free, crypto-free context middleware (D-08/D-09/D-10/D-16)
```typescript
// Separate, lightweight module. Imports NOTHING from the store / cookie-codec /
// node:crypto — only reads headers and returns a rewrite or passthrough.
// Structural test (D-10 amend) greps this module's import graph for the store /
// verifySession / node:crypto and asserts their ABSENCE.
interface RequestLike { headers: { get(name: string): string | null }; }
interface MiddlewareOptions {
  allowedOrigins: readonly string[];   // same source of truth as createAuthBridge
  popupEntryPath: string;              // where to rewrite embedded-unauth requests
  isAuthenticated: (req: RequestLike) => boolean; // app-supplied edge-safe check
}
// On unauth + Sec-Fetch-Dest === 'iframe'  → rewrite to popupEntryPath (URL unchanged)
// On unauth + anything else                → normal redirect / passthrough
// Detection NEVER decides WHETHER to allow — only WHERE to route.
```

### Anti-Patterns to Avoid
- **`postMessage(payload, '*')` for the handle:** MDN: "A malicious site can change the location of the window without your knowledge, and therefore it can intercept the data sent using `postMessage`." The handle is a bearer credential (D-01) — `targetOrigin` MUST be the explicit host origin. `[CITED: MDN postMessage]`
- **Validating only `event.origin`, not `event.source`:** MDN: "Any window (including `http://evil.example.com`) can send a message to any other window in the iframe hierarchy." Origin-only lets a same-origin sender race the channel; the `source === popupWin` identity check closes it (D-02). `[CITED: MDN postMessage]`
- **Exhaustive `switch` on `detectContext`:** breaks the forward-compat contract — a v0.2 `'pwa-shell'` value must fall through to the default, not throw (D-07).
- **Letting `createBridgeMiddleware` import the store / `node:crypto`:** would make the middleware un-runnable in the Edge runtime and couple the UX layer to the security tier (D-16). Keep it a separate module with a structural import-graph assertion.
- **Popup self-navigating `/auth/consume`:** sets the cookie in the popup's top-level partition, not the iframe's — defeats the entire pattern (D-01).
- **Reading `Set-Cookie` via `headers.get("Set-Cookie")` in tests:** must use `getSetCookie()` (array) — Set-Cookie is special-cased by the Fetch API and folding corrupts multi-chunk cookies (Phase 2 RESEARCH Pitfall 1; the existing `bridge-route.test.ts` already enforces this).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embedded-context server signal | A `document.referrer`/`ancestorOrigins` parser or per-host allowlist | The browser-set `Sec-Fetch-Dest: iframe` header (D-09) | It is a `Sec-`-prefixed **forbidden request header** — unspoofable by page JS, Baseline-widely-available since Mar 2023. Hand-rolled heuristics are spoofable and host-fragile. `[CITED: MDN Sec-Fetch-Dest]` |
| URL-rewrite that keeps the address bar unchanged | A manual response-clone / proxy-fetch in middleware | `NextResponse.rewrite(new URL(...))` | Next.js's documented primitive: rewrites the response while leaving the browser URL unchanged. A redirect would add a navigation (D-08 amend). `[CITED: nextjs.org middleware/proxy docs]` |
| Partitioned cookie placement across the iframe boundary | A bespoke cross-frame cookie shuttle | A credentialed `fetch` to consume from the opener (D-14) | CHIPS keys the cookie to the top-level site automatically; no shuttle needed. `[CITED: privacycg/CHIPS]` |
| Cookie parse/serialize | New parsing code | The existing `parseCookieHeader` / `serializeSetCookie` (`cookie-codec.ts`) | Already hand-rolled, audited, CHIPS-correct in Phase 2. The E2E roundtrip reuses them verbatim. |

**Key insight:** This phase's correctness comes from leaning on **browser-guaranteed primitives** (`Sec-Fetch-Dest` unspoofability, CHIPS top-level-site partitioning, `postMessage` origin/source) rather than reconstructing those guarantees in user code. The only things genuinely hand-rolled are the orchestration glue (DI seams) and the pure trust predicate — both trivially auditable.

## Runtime State Inventory

> Phase 3 is **greenfield client code + one E2E test** — it adds new source files and does not rename, migrate, or mutate any stored/registered runtime state. Inventory categories checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore keys/collections/IDs are renamed or written. The in-memory store is constructed fresh per E2E test. | None — verified by reading `in-memory.ts` (no persistent keys) and the phase scope (new files only). |
| Live service config | None — no external service (n8n/Datadog/Cloudflare/etc.) is touched. | None — verified: package-only phase, no deployment config. |
| OS-registered state | None — no OS task/service/scheduler registration. | None — verified: no scripts/daemons added. |
| Secrets/env vars | None — `allowedOrigins`/`cookieName`/`secure` come from the existing `AuthBridgeOptions` (Phase 2). No new secret or env-var name is introduced or renamed. | None — verified by reading `types.ts` (options unchanged for Phase 3 consumption). |
| Build artifacts | None new at research time. **Note:** adding new exports to `index.ts` means `dist/index.{js,d.ts}` must re-emit on `pnpm build`; no subpath export is added (the middleware stays in the main entry per D-16's "same config source," exported as a separate symbol, not a separate subpath). | Re-run `pnpm build` after adding exports (standard; not a state migration). |

**Nothing found requiring data migration.** This is a pure additive-code phase.

## Common Pitfalls

### Pitfall 1: Treating `detectContext` or `Sec-Fetch-Dest` as a security gate
**What goes wrong:** Someone wires "if iframe → allow" or trusts the context signal to grant access.
**Why it happens:** The signal is convenient and feels authoritative.
**How to avoid:** The real gate is **always** Phase 2's `verifySession` on `/auth/bridge` + the one-time opaque handle (CLAUDE.md invariant 4; Phase 2 D-04/ROUTE-01/THREAT-04). The middleware (D-10) only chooses **WHERE** to route an *already-unauthenticated* request. Encode this as the CLIENT-04 test: a **forged `Sec-Fetch-Dest`** changes only the redirect target, never access; plus a **structural assertion** that the middleware module imports neither `verifySession` nor the store (D-10 amend).
**Warning signs:** Any `import` of the store / `verifySession` into `middleware.ts`; any branch where the detection result gates content rather than routing.

### Pitfall 2: `postMessage` with `targetOrigin: '*'` or origin-only validation
**What goes wrong:** The opaque handle (a bearer credential, D-01) is interceptable, or a same-origin attacker races the channel.
**Why it happens:** `'*'` "just works" in dev; the `event.source` check is easy to omit.
**How to avoid:** Popup posts with the explicit host `targetOrigin` (never `'*'`); opener validates **both** `event.origin ∈ allowedOrigins` **and** `event.source === popupWin` (D-02). Tested via the pure `isTrustedMessage` predicate with zero DOM. `[CITED: MDN postMessage]`
**Warning signs:** A literal `'*'` in any `postMessage` call; a message handler that checks origin but not source.

### Pitfall 3: Popup, not opener, drives consume → cookie in wrong partition
**What goes wrong:** The CHIPS cookie is keyed to the popup's top-level site, not the host's; the embedded app never sees its session.
**Why it happens:** Self-navigating the popup to `/auth/consume` looks simpler.
**How to avoid:** The opener (iframe app) issues the consume `fetch` (D-01/D-14). The partition key is the top-level site **at the start of that request** = the host. `[CITED: privacycg/CHIPS]`
**Warning signs:** Any consume call originating in `runPopupFlow`; the popup possessing `next`.

### Pitfall 4: Reading a green pure-Node bench as proof CHIPS works
**What goes wrong:** Vitest/node cannot model the browser's partitioned cookie store; a green E2E is mistaken for partition enforcement.
**Why it happens:** The bench asserts the full data flow and the `Partitioned` attribute *emission*, which looks complete.
**How to avoid:** State the honesty boundary in the test comments (D-11 amend): the bench proves data flow + attribute emission only; **real partition isolation is a Phase 4 manual/browser check.**
**Warning signs:** A test asserting "cookie not visible from another partition" on the node bench (impossible to model — would be a false test).

### Pitfall 5: Exhaustive `switch` / `assertNever` on the open union
**What goes wrong:** A future `'pwa-shell'` value (v0.2) becomes a compile error or runtime throw instead of falling through to the safe default.
**Why it happens:** A well-meaning maintainer "tightens" the type.
**How to avoid:** if/else with a default (D-07), documented **self-contained** at the type and each callsite (no internal requirement IDs in shipped source — D-07 amend). Test: an unknown context value routes to the default. `[CITED: TS open-union pattern]`

### Pitfall 6: Pulling `node:crypto` / store into the middleware import graph
**What goes wrong:** The middleware breaks in the Edge runtime ("The edge runtime does not support Node.js 'crypto' module").
**Why it happens:** Convenience imports from the package root (which re-exports the store factory and could transitively pull `@upstash/redis`).
**How to avoid:** Keep `middleware.ts` a separate module importing only header-reading + `NextResponse`-shaped logic. App-side JWT/session checks in edge middleware should use `jose` (Web Crypto), not `node:crypto` (D-16). Structural import-graph assertion in the test. `[VERIFIED: web search — vercel/next.js discussion #62985, nextauthjs/next-auth #10540]`
**Warning signs:** `import ... from "../transfer-store/..."` or `from "next-auth-bridge"` (root) in `middleware.ts`; any `node:crypto` in its transitive graph.

## Code Examples

### Receiving + validating the popup message (CLIENT-02 / THREAT-03)
```typescript
// Source: MDN Window.postMessage security model (developer.mozilla.org/.../postMessage)
window.addEventListener("message", (event) => {
  // origin allowlist AND source identity — both required (D-02).
  if (!isTrustedMessage(event, { allowedOrigins, expectedSource: popupWin })) return;
  if (typeof event.data !== "object" || event.data === null) return;
  const msg = event.data as { source?: string; type?: string; code?: string };
  if (msg.source !== "next-auth-bridge") return;       // namespace filter (D-03)
  if (msg.type === "auth-success" && typeof msg.code === "string") {
    cleanup(); resolve({ code: msg.code });
  } else if (msg.type === "auth-error") {
    cleanup(); reject(new Error("auth-error"));         // typed rejection (D-04)
  }
});
```

### Popup posting to the opener (CLIENT-01)
```typescript
// Source: MDN postMessage — explicit targetOrigin, never '*' (D-02).
const res = await fetchDep("/auth/bridge");            // Phase 2: 200 { code }, zero cookies
const { code } = await res.json();
openerDep.postMessage(
  { source: "next-auth-bridge", type: "auth-success", code },  // D-03 shape
  hostOrigin,                                          // explicit targetOrigin (NEVER '*')
);
```

### Opener driving consume so the cookie lands in the iframe partition (D-01/D-14)
```typescript
// Source: privacycg/CHIPS — credentialed fetch sets the Partitioned cookie in
// the partition keyed by the top-level (host) site; no top-level navigation needed.
await fetch(`${hostOrigin}/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`, {
  credentials: "include",
  redirect: "follow",        // Set-Cookie on the 302 hop is applied before following
});
// The partitioned cookie is now set; soft-navigate the SPA to `next` (D-14 fetch branch).
```

### Next.js middleware shape (CLIENT-04, app-side wiring)
```typescript
// Source: nextjs.org middleware/proxy docs (v16.2.7). NextResponse.rewrite keeps
// the browser URL unchanged; config.matcher is app-owned. Middleware (now also
// callable "proxy" in v16) reads headers and returns a rewrite or passthrough.
import { NextResponse } from "next/server";
export function middleware(request) {                 // or `proxy` on Next 16
  const dest = request.headers.get("Sec-Fetch-Dest"); // browser-set, unspoofable
  if (isUnauthEdgeSafe(request) && dest === "iframe") {
    return NextResponse.rewrite(new URL(POPUP_ENTRY, request.url)); // URL unchanged
  }
  return NextResponse.next();                          // browser/other → passthrough
}
export const config = { matcher: ["/((?!api|_next/static|_next/image).*)"] };
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js middleware runs only in the **Edge runtime** (`node:crypto` etc. unavailable) | Middleware (renamed **`proxy`** in v16) can run in the **Node.js runtime**; **v16 defaults to Node.js**, v15.5 made Node.js stable | Next.js v15.5.0 (stable) / v16.0.0 (rename + Node default) | D-16's "must be edge-safe" is now a **portability guarantee** (keep it edge-safe so it works in either runtime) rather than a platform-forced constraint. The discipline (no store/`node:crypto`) still holds — it keeps the module light and runtime-agnostic. `[CITED: nextjs.org middleware/proxy docs, version 16.2.7]` |
| `middleware.ts` file convention | `proxy.ts` (codemod `@next/codemod middleware-to-proxy`); `middleware.ts` still works but deprecated in v16 | Next.js v16.0.0 | The **package** doesn't ship a `middleware.ts`/`proxy.ts` file — it exports a `createBridgeMiddleware(options)` factory the app wires into whichever convention its Next version uses. No package change needed; document both names. `[CITED: nextjs.org middleware/proxy docs]` |
| Third-party cookies broadly allowed | Cross-site cookies must be `Partitioned` (CHIPS); `Sec-Fetch-Storage-Access` sent from Chrome 133 on credentialed cross-site requests | CHIPS GA in Chrome; Chrome 133+ | Confirms the credentialed-fetch consume path is the supported, first-class way to set/read the partitioned session cookie cross-context. `[CITED: privacysandbox.google.com/cookies/chips]` |

**Deprecated/outdated:**
- Trusting `document.referrer`/`ancestorOrigins` for embedded detection: superseded by `Sec-Fetch-Dest` (browser-set, unspoofable). Rejected by D-05 anyway.
- `node:crypto` in edge middleware: use `jose` (Web Crypto) for any app-side JWT work; the package's middleware does no crypto at all.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact WHATWG-fetch normative clause that `Set-Cookie` on a 302 hop is applied before following (with `redirect: 'follow'`) was not first-party-quotable in-session; behavior is confirmed via multiple secondary sources + browser-bug trackers and is the observed default. | D-14 (c) | LOW — behavior is well-established and observable; if a specific browser/version regressed it, the navigate fallback (D-14) is available. The bench (D-11) doesn't depend on this clause (function-level sim); only the live Phase 4 browser check does. |
| A2 | Mode A targets the embedded app and its host as the **same host site** (single-origin roundtrip per Phase 4), so the opener's consume request keys the partition to the host. | D-14 (a) | MEDIUM — if a deployment embeds a *different* origin than the top-level host, the partition key is the host's site, not the app's; the app must read from that same top-level partition. This is the intended Mode A shape (enterprise host iframing the app), but the planner/Phase 4 should make the single-origin assumption explicit in the roundtrip test and the threat-model. |
| A3 | The app supplies an **edge-safe `isAuthenticated`** to `createBridgeMiddleware` (or the middleware reads a cookie presence signal) so the factory itself imports no crypto. | Pattern 5 / D-16 | LOW — keeps the factory store/crypto-free by construction; if the app needs real JWT verification in middleware it uses `jose`. The factory's contract (UX routing only, D-10) means it does not *need* to cryptographically verify — a cookie-presence heuristic is sufficient because the real gate is `/auth/bridge`. |

## Open Questions (RESOLVED)

1. **RESOLVED — GET-fetch (`?code=` in URL) vs POST-fetch (code in body) for consume.**
   - What we know: GET works with **zero Phase 2 change** (consume reads `code`/`next` from the query — verified). D-15 explicitly permits the opaque handle in the consume URL.
   - What's unclear: whether the maintainer prefers to also keep the handle out of the request URL (POST-fetch with the code in the body), which would be an additive Phase 2 change (read `code` from body too).
   - **RESOLVED:** ship **GET-fetch** in Phase 3 (minimal, in-scope; locked by D-14 and encoded in plan 03-04). Treat POST-fetch as an optional, additive future hardening — do NOT expand Phase 2 scope for it.

2. **RESOLVED — `isAuthenticated` source for the middleware (edge-safe).**
   - What we know: the middleware must not import the store or `node:crypto` (D-16). The real gate is `/auth/bridge`.
   - What's unclear: exact signal the app passes (cookie presence vs a `jose`-verified token).
   - **RESOLVED:** type it as an app-supplied `(req) => boolean` dep (Pattern 5; encoded in plan 03-02). A cookie-presence check is sufficient *because* detection is UX-only; cryptographic verification stays in the app/`/auth/bridge`.

## Environment Availability

> Phase 3 adds source files + tests only; the test bench is the existing Vitest config. No new external tools/services are required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `vitest` | All Phase 3 tests | ✓ (devDep) | `^4.1.8` | — |
| `typescript` | Strict types / open union | ✓ (devDep) | `^5` | — |
| Node.js (test runtime) | `environment: "node"` bench | ✓ | (repo toolchain) | — |
| `next` (peer) | Only the *app* wiring the middleware; not the core package | n/a for the package | 15.5+/16 app-side | Structural `NextRequest`/`NextResponse`-shaped types avoid a hard import |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — the middleware references Next types structurally, not via a runtime import, keeping the core package framework-version-agnostic (mirrors the D-04 no-concrete-Auth.js-type pattern).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.8` |
| Config file | `packages/core/vitest.config.ts` (`environment: "node"`, `include: ["src/**/*.test.ts"]`) |
| Quick run command | `pnpm --filter next-auth-bridge test` (or `pnpm test` at repo root) — `vitest run`, one-shot |
| Full suite command | `pnpm test` (root) — runs the whole `src/**/*.test.ts` set |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLIENT-01 | `runPopupFlow` fetches `/auth/bridge` → gets `{ code }` → posts `{source,type:'auth-success',code}` to opener with explicit `targetOrigin` (never `'*'`) | unit (DI fakes) | `pnpm test -- popup-flow` | ❌ Wave 0 |
| CLIENT-02 | `openAuthPopup` opens popup, resolves `{ code }` on valid message; rejects on `auth-error`, popup-closed, timeout (typed, cleans up) | unit (DI fakes) | `pnpm test -- open-auth-popup` | ❌ Wave 0 |
| CLIENT-02 / THREAT-03 | **Wrong-origin message rejected** (origin not in allowlist) → flow does not resolve | unit, **pure predicate, zero DOM** | `pnpm test -- is-trusted-message` | ❌ Wave 0 |
| CLIENT-02 / THREAT-03 | **Wrong-source message rejected** (`event.source !== popupWin`, same-origin racer) → not resolved | unit, **pure predicate, zero DOM** | `pnpm test -- is-trusted-message` | ❌ Wave 0 |
| CLIENT-03 | `detectContext` returns `'iframe'` when `self !== top` (and on cross-origin throw); `'browser'` otherwise | unit (fake `window`-like) | `pnpm test -- detect-context` | ❌ Wave 0 |
| CLIENT-03 | An **unknown/unexpected** context value routes to the **default (browser)** branch — not a type error or thrown case (open-union forward-compat) | unit | `pnpm test -- detect-context` | ❌ Wave 0 |
| CLIENT-04 | Embedded (`Sec-Fetch-Dest: iframe`) unauth → `rewrite` to popup entry; browser → normal/passthrough | unit (Request-like) | `pnpm test -- middleware` | ❌ Wave 0 |
| CLIENT-04 | **Forged `Sec-Fetch-Dest`** changes only the **UX target**, never access — vary only the detection signal at fixed auth state; security outcome invariant | unit (negative) | `pnpm test -- middleware` | ❌ Wave 0 |
| CLIENT-04 (D-10 amend) | **Structural:** middleware module imports no `verifySession`, no store, no `node:crypto` (import-graph/grep assertion) | structural/unit | `pnpm test -- middleware` | ❌ Wave 0 |
| CLIENT-05 / THREAT-07 | No **session token** (`authjs.session-token` / `__Secure-…`) appears in any URL the client constructs; the opaque `code` MAY appear in the consume URL (D-15) | unit + E2E assertion | `pnpm test -- roundtrip` | ❌ Wave 0 |
| Success criterion 5 (D-11) | **E2E:** iframe → bridge (`200 {code}`) → function-level postMessage sim → consume (`302` + per-chunk `Partitioned` `Set-Cookie`) green on the pure-Node bench | integration (real handlers, in-memory store) | `pnpm test -- roundtrip` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- <changed-helper>` (the focused file, < 5 s; pure-Node, no timers).
- **Per wave merge:** `pnpm test` (full `src/**/*.test.ts` suite, including the Phase 1/2 regression set).
- **Phase gate:** full suite green before `/gsd-verify-work`; the D-11 E2E roundtrip is the headline "first end-to-end flow on the bench" criterion.

### Manual-Only / Phase-4-Deferred (cannot be sampled on the node bench)
- **Real CHIPS partition enforcement** — that the partitioned cookie set via the opener's consume fetch is **isolated to the host partition and invisible from a different top-level site's partition**. Vitest/node cannot model the browser's partitioned cookie store (D-11 amend). The bench asserts only the `Partitioned` attribute **emission** and the data flow. *Real isolation → Phase 4 manual/browser check.*
- **`Sec-Fetch-Dest` actually emitted as `iframe` by a real browser for sub-frame document loads** — confirmed by spec here (`[CITED: MDN]`) but the live-browser emission is a Phase 4/Phase 5 observation, not a node-bench assertion (the node tests inject the header value).
- **Live popup ↔ opener `postMessage` across real windows** — modeled as a function-level simulation on the bench (D-11); the live handshake is exercised in the Phase 5 example app on Vercel.

### Wave 0 Gaps
- [ ] `src/__tests__/is-trusted-message.test.ts` — covers THREAT-03 (wrong-origin AND wrong-source), zero DOM
- [ ] `src/__tests__/open-auth-popup.test.ts` — covers CLIENT-02 (resolve + all typed rejections + cleanup)
- [ ] `src/__tests__/popup-flow.test.ts` — covers CLIENT-01
- [ ] `src/__tests__/detect-context.test.ts` — covers CLIENT-03 (iframe/browser + unknown→default)
- [ ] `src/__tests__/middleware.test.ts` — covers CLIENT-04 (routing + forged-signal invariance + structural no-store/no-crypto)
- [ ] `src/__tests__/roundtrip.e2e.test.ts` — covers success criterion 5 + CLIENT-05/THREAT-07
- [ ] Shared DI-fake helpers (fake `window`/`open`/message bus) — extend `src/__tests__/helpers.ts` (the existing Phase 2 helper module)
- Framework install: **none** — Vitest config already exists and needs no change.

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`. This phase touches the `postMessage` channel, the cookie handoff trigger, and wrapper-detection — all CLAUDE.md threat-model-discipline triggers (a corresponding threat-model entry + negative test is required; the canonical `docs/threat-model.md` is authored in Phase 4, so Phase 3 ships the negative tests with `THREAT-NN` comment tags for traceability).

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (delegated) | The real auth gate is Phase 2 `verifySession` + the one-time handle. Phase 3 adds NO auth decision (CLIENT-04 is UX routing only). |
| V3 Session Management | yes (transport) | The partitioned session cookie is set via the opener's consume fetch (CHIPS: `Secure; HttpOnly; SameSite=None; Partitioned` — emitted by Phase 2). Phase 3 must not place the session **token** in any URL (CLIENT-05/THREAT-07). |
| V4 Access Control | no (UX only) | Middleware detection NEVER gates access (D-10). Structural + behavioural tests prove it can't. |
| V5 Input Validation | yes | Validate the inbound `postMessage`: `event.origin` allowlist + `event.source` identity + `source` namespace + `type` discriminator + shape check before trusting `code` (D-02/D-03). |
| V6 Cryptography | no | Phase 3 performs no crypto. The 256-bit handle entropy is Phase 1's single site; the middleware does NOT import `node:crypto` (D-16). |

### Known Threat Patterns for this stack (cross-context browser auth)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Handle interception via `postMessage(payload, '*')` | Information Disclosure | Explicit `targetOrigin` = host origin, never `'*'` (D-02). `[CITED: MDN postMessage]` (THREAT-03) |
| Same-origin / foreign window racing the message channel | Spoofing | Validate `event.origin ∈ allowedOrigins` AND `event.source === popupWin`; filter on `source: 'next-auth-bridge'` namespace (D-02/D-03). (THREAT-03) |
| Forged `Sec-Fetch-Dest` to manipulate routing | Tampering | Detection is UX-only (D-10) — a forged value changes only the redirect target, never access; structural assertion proves no store/`verifySession` import. `Sec-`-prefixed header is browser-set/unspoofable for real navigations anyway. `[CITED: MDN Sec-Fetch-Dest]` |
| Session token leaked into a URL (history/`Referer`/logs) | Information Disclosure | Token rides ONLY in the consume `Set-Cookie`; the client never constructs a URL containing it (CLIENT-05/THREAT-07). The opaque handle in `?code=` is permitted (D-15). |
| Cookie set in the wrong (popup) partition | Tampering / Repudiation | Opener (not popup) drives consume so the CHIPS partition key = host site (D-01/D-14). `[CITED: privacycg/CHIPS]` |
| Middleware pulling `node:crypto` → edge-runtime break / tier coupling | Denial of Service / (defense-in-depth erosion) | Store-free, crypto-free middleware module + import-graph structural assertion (D-16). |
| Open-redirect via `next` | Tampering | `sanitizeNext` (Phase 2 — already degrades unsafe `next` to `/`). The opener passes `next` through to consume unchanged; the server-side control stays authoritative. |

## Sources

### Primary (HIGH confidence)
- `[CITED: developer.mozilla.org/.../Window/postMessage]` — targetOrigin-never-`'*'` warning; origin + source validation model; "any window can send a message"; the "do we trust the sender" guidance.
- `[CITED: developer.mozilla.org/.../Headers/Sec-Fetch-Dest]` — `iframe` value for sub-frame loads; **forbidden request header** (`Sec-` prefix → browser-set, unspoofable by page JS); full value list; Baseline-widely-available since Mar 2023.
- `[CITED: github.com/privacycg/CHIPS]` — partition key = top-level site at the **start of the request**, request-context-agnostic; subresource/fetch sets partitioned cookies equally; **no top-level-navigation requirement**; `Secure` mandatory.
- `[CITED: developer.mozilla.org/.../Privacy_sandbox/Partitioned_cookies]` — partition key keyed to the top-level site (worked example); `Secure` required; `__Host` recommendation.
- `[CITED: nextjs.org middleware/proxy docs, version 16.2.7, lastUpdated 2026-05-13]` — `NextResponse.rewrite` keeps the URL unchanged; `config.matcher`; runtime history (Node.js runtime stable in 15.5, default in 16; `middleware`→`proxy` rename + codemod).

### Secondary (MEDIUM confidence)
- `[VERIFIED: web search — privacysandbox.google.com/cookies/chips]` — `Sec-Fetch-Storage-Access` from Chrome 133 on credentialed cross-site requests; CHIPS double-keying.
- `[VERIFIED: web search — vercel/next.js discussion #62985, nextauthjs/next-auth #10540]` — "edge runtime does not support `node:crypto`"; `jose`/Web-Crypto remedy; `runtime: "nodejs"` option for middleware.

### Tertiary (LOW confidence — flagged in Assumptions Log)
- `[ASSUMED]` (A1) — exact WHATWG-fetch normative clause for Set-Cookie application on a 302 hop with `redirect: 'follow'`; corroborated by multiple browser-bug-tracker and explainer sources (`bugzilla.mozilla.org/1483832` etc.) and by observable browser behavior, but not first-party-quoted in-session.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all primitives are Web-standard and confirmed.
- Architecture / D-14 (the decisive item): HIGH — partition-key derivation and the no-navigation-required property are confirmed against the CHIPS spec/explainer and MDN; only the precise fetch-redirect Set-Cookie spec clause is `[ASSUMED]` (A1), and the bench doesn't depend on it.
- Sec-Fetch-Dest / postMessage (D-09 / D-02): HIGH — directly confirmed against MDN, including unspoofability and the dual origin+source requirement.
- Next.js middleware / D-16: HIGH — confirmed against current (v16.2.7) docs; note the runtime-landscape currency finding (Node runtime now available/default) reframes "edge-safe" as a portability guarantee.
- Pitfalls / validation: HIGH — grounded in the locked decisions + the existing Phase 1/2 test patterns (`getSetCookie()`, clock seam, colocated negatives).

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 for the CHIPS / postMessage / Sec-Fetch-Dest specs (stable); ~2026-06-22 for the Next.js middleware/`proxy` surface (fast-moving — v16 just renamed it; re-verify the convention name and runtime default if planning slips a release).
