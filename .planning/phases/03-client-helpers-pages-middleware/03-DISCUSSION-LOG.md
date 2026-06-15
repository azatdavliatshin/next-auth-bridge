# Phase 3: Client Helpers, Pages & Middleware - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 3-Client Helpers, Pages & Middleware
**Areas discussed:** postMessage handshake, detectContext signals, Middleware routing, Test-bench E2E strategy

---

## postMessage Handshake

### Q1 — Who calls /auth/consume?

| Option | Description | Selected |
|--------|-------------|----------|
| Popup self-navigates | Popup navigates to /auth/consume, cookie set in popup top-level context, postMessages 'done'. | |
| Opener navigates after handoff | Popup postMessages {code} to opener; opener drives /auth/consume so the partitioned cookie lands in the iframe's partition. | ✓ |
| You decide | Pick what's correct for CHIPS + iframe-embedded Mode A. | |

**User's choice:** Opener navigates after handoff
**Notes:** Makes the {code} a bearer handle crossing the postMessage boundary -> origin checks become security-critical. (D-01)

### Q2 — Message channel design

| Option | Description | Selected |
|--------|-------------|----------|
| targetOrigin + event.origin allowlist | Explicit targetOrigin (never '*'); opener verifies event.origin in allowedOrigins AND event.source === opened popup ref. | ✓ |
| Add a nonce/handshake token | Same + a one-time nonce echoed by the popup. | |
| You decide | Pick the right rigor. | |

**User's choice:** targetOrigin + event.origin allowlist (with event.source identity)
**Notes:** No nonce — the handle is already one-time-use / short-TTL, so origin+source is the proportionate boundary (THREAT-03). (D-02)

### Q3 — Payload contract

| Option | Description | Selected |
|--------|-------------|----------|
| Discriminated type + namespace | { source: 'next-auth-bridge', type: 'auth-success', code } / { type: 'auth-error', reason }. | ✓ |
| Minimal {code} only | Just { code } on success; absence = failure. | |
| You decide | Pick the payload shape. | |

**User's choice:** Discriminated type + namespace
**Notes:** Namespace filters foreign postMessages; type discriminates success/error. (D-03)

### Q4 — openAuthPopup lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Resolve code / reject on all failures | Resolves { code }; rejects on auth-error, popup-closed, timeout; cleans up listener+interval. | ✓ |
| Resolve a result union | Always resolves { ok, code } | { ok:false, reason }; never rejects. | |
| You decide | Pick the contract + failure set. | |

**User's choice:** Resolve code / reject on all failures
**Notes:** Single awaitable with typed rejections; cleanup on settle. (D-04)

---

## detectContext Signals

### Q1 — iframe vs browser signal

| Option | Description | Selected |
|--------|-------------|----------|
| window.self !== window.top | Canonical embedded check, try/catch (cross-origin throw confirms embedding). | ✓ |
| frame check + ancestorOrigins | Plus referrer/ancestorOrigins host inspection. | |
| You decide | Pick the detection signal. | |

**User's choice:** window.self !== window.top
**Notes:** No host-specific heuristics in v0.1. (D-05)

### Q2 — SSR / no-window behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Default to 'browser' | No window -> return 'browser'; client re-detects on hydration. | |
| Separate server detection input | detectContext client-only; middleware does its own header-based inference. | ✓ |
| You decide | Pick handling + whether middleware reuses detectContext. | |

**User's choice:** Separate server detection input
**Notes:** Two detectors, one per environment — feeds the Middleware area (Sec-Fetch-Dest). (D-06)

### Q3 — Open-union enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| if/else with browser default | Known cases explicit, everything else -> default branch; tested. | |
| Type stays wide, runtime narrows | Same + documented open-union contract at type def and callsites. | ✓ |
| You decide | Pick the callsite pattern. | |

**User's choice:** Type stays wide, runtime narrows (documented)
**Notes:** Belt-and-suspenders so a future maintainer doesn't tighten to an exhaustive switch. (D-07)

---

## Middleware Routing

### Q1 — Middleware job for embedded requests

| Option | Description | Selected |
|--------|-------------|----------|
| Rewrite/route to popup entry | Embedded unauth -> popup-bridge entry; browser -> normal Auth.js redirect. | ✓ |
| Annotate request, app decides | Middleware only sets a context header; pages own routing. | |
| You decide | Pick what middleware concretely does. | |

**User's choice:** Rewrite/route to popup entry
**Notes:** A full-page IdP redirect breaks inside an iframe — context routing is the real UX value. (D-08)

### Q2 — Server-side embedded signal

| Option | Description | Selected |
|--------|-------------|----------|
| Sec-Fetch-Dest: iframe | Browser-set header for sub-frame navigations; default 'browser' when absent. | ✓ |
| Explicit query/path marker | Host integration sets ?embedded=1 / path prefix. | |
| You decide | Pick the server-side signal. | |

**User's choice:** Sec-Fetch-Dest: iframe
**Notes:** Not page-spoofable for navigations; absent/unknown -> browser default. (D-09)

### Q3 — Packaging + UX-only proof

| Option | Description | Selected |
|--------|-------------|----------|
| Factory + no-auth-decision invariant | createBridgeMiddleware(options) factory; only routes already-unauth requests; forged Sec-Fetch-Dest changes only the target, never access. | ✓ |
| Composable wrapper over app matcher | Ship a routing helper the app composes; no top-level middleware export. | |
| You decide | Pick packaging + negative test. | |

**User's choice:** Factory + no-auth-decision invariant
**Notes:** Real gate stays /auth/bridge verifySession; forged-header negative test proves UX-only. (D-10 / CLIENT-04)

---

## Test-bench E2E Strategy

### Q1 — E2E flow bench shape

| Option | Description | Selected |
|--------|-------------|----------|
| Node: drive handlers + simulate channel | Pure-Node; real handlers via Request objects; postMessage handoff simulated at function level; asserts partitioned Set-Cookie end-to-end. | ✓ |
| Add jsdom for the client layer | jsdom/happy-dom environment for openAuthPopup/postMessage. | |
| You decide | Pick the DOM-realism level. | |

**User's choice:** Node: drive handlers + simulate channel
**Notes:** Keeps the bench dependency-free, consistent with Phase 2 Request-driven tests. (D-11)

### Q2 — Testing the window-touching helpers

| Option | Description | Selected |
|--------|-------------|----------|
| Inject browser deps (seam) | Helpers take browser deps via params; tests inject fakes; mirrors Phase 1 clock seam; THREAT-03 via fake MessageEvent. | ✓ |
| Minimal stubbed globals | Stub globalThis.window in test files. | |
| You decide | Pick the testability approach. | |

**User's choice:** Inject browser deps (seam)
**Notes:** No global window required; DI is the established project seam pattern. (D-12)

### Q3 — Popup page deliverable form

| Option | Description | Selected |
|--------|-------------|----------|
| Extract logic, thin .tsx wrapper | runPopupFlow(deps) + a thin popup-page.tsx; adds React peer dep + JSX config. | |
| Defer .tsx to the example app | Package ships only runPopupFlow(deps); the .tsx component is authored in the Phase 5 example app. React-free package. | ✓ |
| You decide | Pick whether the package ships the .tsx. | |

**User's choice:** Defer .tsx to the example app
**Notes:** Keeps packages/core React-free and pure-Node for v0.1; intentional deviation from the CLAUDE.md popup-page.tsx pointer, recorded in D-13. (D-13)

---

## Claude's Discretion

- Exact public export names / file layout under `packages/core/src/`.
- `openAuthPopup` timeout default and `window.open` features / popup URL construction.
- Precise shape of the injected-dependency seam (single `deps` object vs individual params).
- Exact 4xx/redirect mechanics the middleware emits and how it composes with the app's `config.matcher` / Auth.js middleware.
- Whether the `'pwa-shell'` arm needs any v0.1 code beyond the type member + default-fallback test.

## Deferred Ideas

- The actual `/auth/popup` `.tsx` React component -> Phase 5 example app (D-13).
- `native-signin-page.tsx` / any Mode B client surface -> v0.2; `'pwa-shell'` is a type-level stub only.
- jsdom / happy-dom DOM-realistic client tests -> rejected for v0.1 (D-12).
- Nonce / handshake-token hardening on the postMessage channel -> rejected as redundant (D-02).
- Host-specific embedded detection (referrer / ancestorOrigins) -> rejected for v0.1 (D-05).
