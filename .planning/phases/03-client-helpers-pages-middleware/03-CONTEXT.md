# Phase 3: Client Helpers, Pages & Middleware - Context

**Gathered:** 2026-06-08
**Revised:** 2026-06-08 — review addendum after CONTEXT audit: added D-14 (consume invocation mode: fetch-vs-navigate, the load-bearing CHIPS question), D-15 (URL-hygiene disambiguation: session-token-never-in-URL vs the handle in the consume request URL), D-16 (middleware edge-runtime import isolation), plus inline amendments to D-07/D-08/D-10/D-11/D-12. These close the under-specified failure/mechanism paths surfaced in review; re-plan to fold them in.
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **client surfaces that drive Mode A** and connect them to the Phase 2 server routes, producing the **first complete iframe to partitioned-cookie flow on the Vitest bench**. Covers requirements **CLIENT-01 through CLIENT-05**.

- **`runPopupFlow(deps)`** — the framework-agnostic popup behavior (silent-auth in the top-level popup context, `fetch('/auth/bridge')` for `{ code }`, then `postMessage` the code to the opener). CLIENT-01.
- **`openAuthPopup(...)`** — the opener-side helper: opens `/auth/popup`, awaits the popup's `postMessage`, enforces `postMessage` origin checks on receipt (THREAT-03), and resolves the `{ code }` to the caller. CLIENT-02. The opener (the embedded iframe app) then drives `/auth/consume` so the CHIPS partitioned cookie lands in the iframe's partition.
- **`detectContext()`** — open-union `'iframe' | 'browser' | 'pwa-shell'` client-side context detector with default-fallback callsites (CLIENT-03).
- **`createBridgeMiddleware(options)`** — a context-routing middleware factory that routes unauthenticated **embedded** requests toward the popup-bridge entry for UX only, never gating security on the detection result (CLIENT-04).
- **Client-side URL hygiene** — no session **token** in any URL the client constructs across the flow (CLIENT-05 / THREAT-07). The handle is JSON-body-only from the bridge (Phase 2 D-07); the popup forwards it via `postMessage`, never a URL. **See D-15:** the property is "the session **token** never appears in a URL" — the opaque one-time handle *may* appear in the `/auth/consume` request URL (if consume is GET-driven, D-14); these are distinct and the THREAT-07 test must assert the former, not forbid the latter.

The locked **server contract** this phase consumes (Phase 2): `/auth/bridge` -> `200 { code }` JSON, zero cookies; `/auth/consume?code=&next=` -> `302` with the partitioned `Set-Cookie`(s); a bad/absent/replayed handle -> `4xx` no cookie.

**Out of scope (later phases / v0.2):** the canonical `docs/threat-model.md` and the full single-origin roundtrip *integration* doc/test mapping (Phase 4 — HARDEN-*); the multi-tenant Entra example app and the actual `/auth/popup` React component (Phase 5 — EXAMPLE-*); any Mode B / PWA-shell auth flow (`'pwa-shell'` is a v0.2 return path, stubbed open-union only).

</domain>

<decisions>
## Implementation Decisions

### postMessage Handshake (CLIENT-01 / CLIENT-02 / THREAT-03)

- **D-01 (consume caller — opener navigates after handoff):** The popup `postMessage`s the `{ code }` to the **opener** (the embedded iframe app); the **opener** drives `/auth/consume` so the CHIPS partitioned cookie is set in the **iframe's** partition. The `{ code }` is therefore a bearer handle that crosses the `postMessage` trust boundary — this is exactly why the origin checks (D-02) are security-critical, not cosmetic. (Rejected "popup self-navigates `/auth/consume`": that would set the cookie in the popup's top-level context, not the iframe partition that needs it.)
- **D-02 (message channel — targetOrigin + origin allowlist + source identity):** The popup posts with an **explicit `targetOrigin`** (never `'*'`). The opener verifies **`event.origin` is in `allowedOrigins` AND `event.source === ` the popup `Window` reference it opened**. Both checks are required: origin gates the sender's origin, `source` identity rejects an unsolicited same-origin sender racing the channel. **No nonce/handshake token** — the handle is already one-time-use and short-TTL (Phase 1), so origin+source is the proportionate boundary. A message failing either check is dropped (THREAT-03 negative test: wrong-origin message is rejected, flow does not resolve).
- **D-03 (payload shape — namespaced discriminated union):** Messages carry a package namespace + a discriminating `type`:
  - success: `{ source: 'next-auth-bridge', type: 'auth-success', code }`
  - error: `{ source: 'next-auth-bridge', type: 'auth-error', reason }`
  The `source` namespace lets the opener ignore foreign `postMessage`s on the same window; `type` discriminates success vs error. (Rejected "minimal `{ code }` only": no structured error reason, harder to filter foreign messages.)
- **D-04 (lifecycle — resolve code / reject on all failures):** `openAuthPopup(...)` returns a **promise** that **resolves with `{ code }`** on an `auth-success` message and **rejects** on: an `auth-error` message, **popup-closed** (poll `window.closed`), and **timeout**. Rejection reasons are typed/distinguishable. The handler **cleans up** the message listener and the close-poll interval on settle (success or failure), no leaks. (Rejected the always-resolve result-union: the user wants a single awaitable with typed rejections.)

### detectContext (CLIENT-03)

- **D-05 (detection signal — `window.self !== window.top`):** The canonical embedded check, wrapped in **try/catch**: a cross-origin access throw on `window.top` *itself* confirms embedding -> `'iframe'`; otherwise `'browser'`. No host-specific heuristics (`document.referrer`, `ancestorOrigins`) in v0.1 — the binary iframe/browser distinction is all the UX routing needs.
- **D-06 (client-only; middleware detects separately):** `detectContext` is **client-only** — it guards on `window` and is never called server-side. The **middleware does its own server-side inference** from request headers (D-09), rather than reusing `detectContext`. Two detectors, one per environment. (This avoids a `window`-undefined branch leaking into the public client helper.)
- **D-07 (open union — type stays wide, runtime narrows; documented):** The return type stays the wide open union `'iframe' | 'browser' | 'pwa-shell'`. Callsites handle the known cases explicitly and treat **everything else as the default (`browser`) branch** — **if/else with a default, never an exhaustive switch, no `never` assertion**. The open-union forward-compat contract is **documented at the type definition AND at each callsite** so a future maintainer does not "tighten" it into an exhaustive switch (belt-and-suspenders). An unknown future value (`'pwa-shell'` in v0.2) falls through to the safe default. **Test:** an unknown/unexpected context value routes to the default, not a type error or a thrown case. (Satisfies the CLIENT-03 acceptance criterion verbatim.)

### Middleware Routing (CLIENT-04)

- **D-08 (job — rewrite/route embedded requests to the popup entry):** On an unauthenticated **embedded** request to a protected path, the middleware routes the user toward the **popup-bridge entry** (the page that triggers `openAuthPopup`) instead of a normal full-page redirect to the IdP — a full-page IdP redirect breaks inside an iframe. A **browser**-context unauthenticated request gets the **normal Auth.js redirect**. This context-aware routing is the real UX value of the middleware. (Rejected "annotate-only, app decides": pushes the iframe-vs-browser routing decision onto every consumer.)
- **D-09 (server-side signal — `Sec-Fetch-Dest: iframe`):** The middleware infers "embedded" from the **`Sec-Fetch-Dest` request header** (`iframe` for sub-frame navigations). Browser-set and not spoofable by page JS for navigations; the cleanest server-side embedded signal. **Absent/unknown -> default to `browser`** (the safe, non-embedded routing target).
- **D-10 (packaging + UX-only invariant — `createBridgeMiddleware` factory):** Export a **`createBridgeMiddleware(options)`** factory (matches the no-class convention) returning a Web-standard middleware function. It only chooses **WHERE** to route an **already-unauthenticated** request, **never WHETHER** to allow access — the real gate stays `/auth/bridge`'s `verifySession` (Phase 2 D-04 / ROUTE-01 / THREAT-04). **Negative test (CLIENT-04):** a **forged `Sec-Fetch-Dest`** header changes only the redirect *target*, and never grants or denies access to protected content — proving detection is UX routing, not a security boundary.

### Test-Bench & Deliverable Form (CLIENT-05 / success criterion 5)

- **D-11 (E2E flow — pure-Node bench, simulated channel):** The first iframe->bridge->consume->partitioned-cookie roundtrip runs on the **existing pure-Node Vitest bench** (no jsdom/DOM runtime added). Drive the **real** `bridge`/`consume` handlers with plain `Request` objects; model the popup<->opener `postMessage` handoff as a **function-level simulation** (pass the `{ code }` from the bridge response into the consume call), asserting the full data flow **and** the partitioned `Set-Cookie` end-to-end. Keeps the bench dependency-free and consistent with Phase 2's `Request`-driven route tests.
- **D-12 (client-helper tests — dependency-injection seam):** `openAuthPopup` / `runPopupFlow` / `detectContext` take their **browser dependencies via parameters/options** (e.g. an injected `open`, `addEventListener`/`postMessage`, or a `window`-like object) so tests inject **fakes** with **no global `window`** needed. This mirrors the Phase 1 **clock seam** pattern (injectable `now()`). The THREAT-03 **wrong-origin rejection** is tested directly against a fake `MessageEvent` carrying a disallowed `origin` / mismatched `source`. Stays pure-Node. (Rejected "stub `globalThis.window`": couples tests to global mutation; DI is the established project seam pattern.)
- **D-13 (popup page deliverable — defer `.tsx` to the example app):** v0.1 **package** ships only the framework-agnostic, DI-testable **`runPopupFlow(deps)`** function — **no `.tsx`, no React dependency, no JSX config**. The actual `/auth/popup` **page component** is authored in the **Phase 5 reference example app**, which already has a real Next.js/React runtime. This keeps the package React-free and the entire tested surface pure-Node. **Deviation note:** this departs from the `popup-page.tsx` pointer in `CLAUDE.md` (architecture pointers); the pointer described the eventual component, which now lives in the example app, not in `packages/core`. The planner should surface this as an intentional, recorded deviation (and it keeps the package's public surface free of a React peer dependency for v0.1). *(Forward-compat hook: if a ready-made page is later demanded, it can be added via an isolated subpath export — e.g. `next-auth-bridge/react` — with React as an **optional** peerDependency, mirroring the `./store/kv` isolation pattern. Additive; does not contaminate the React-free core. Not v0.1.)*

### Mechanism & Hygiene Addendum (review addendum)

These decisions specify mechanism/failure paths that D-01..D-13 left implicit. Surfaced auditing the CONTEXT against the Phase 2 server contract and the CHIPS partition reality; locking them keeps the invariants traceable rather than improvised at execution.

- **D-14 (consume invocation mode — fetch vs navigate; the load-bearing CHIPS question):** D-01 says "the opener drives `/auth/consume`" but leaves *how* open, and the *how* is security- and correctness-critical:
  - **hard-navigate** (set the iframe's `location` to `/auth/consume?code=…&next=…`) → must be **GET** → the handle rides in the URL (history/`Referer`/server logs) and the iframe's SPA state is unloaded; the `302 → next` lands the iframe authenticated on `next`.
  - **fetch** (`credentials: 'include'`, can be **POST** with the code in the body) → the handle stays **out of the URL** and SPA state is preserved → but the `302 → next` is followed by `fetch`, so the opener must render/soft-navigate to `next` itself.
  - **Locked invariant:** whichever is chosen, the partitioned `Set-Cookie` from the consume response **must land in the iframe's partition** (top-level site = host). **Researcher MUST confirm (sharpened from the CHIPS research item below):** does a `fetch` issued from inside the iframe apply a `Partitioned` `Set-Cookie` carried on the **302 redirect hop** into the *fetching context's* partition, or is a hard top-level navigation required for the cookie to be written to the iframe partition? The answer picks fetch-vs-navigate. If `fetch` works, prefer it (keeps the handle out of the URL — aligns with D-15 and Phase 2 D-07's no-handle-in-URL ethos, and preserves iframe state). Phase 2 `consume` already returns `302` (D-08) and currently assumes GET-with-query; if POST-fetch is chosen, confirm `consume` reads `code` from the body as well, or document GET-with-query as the locked transport.
- **D-15 (URL-hygiene disambiguation — token vs handle):** CLIENT-05 / THREAT-07's property is **"the Auth.js session *token* never appears in any URL"** — the token lives **only** in the partitioned `Set-Cookie` set by `consume`, never in a URL the client constructs. The **opaque one-time handle** (`code`) is a *different* artifact: it is opaque, single-use, ≤60s TTL (Phase 1), and — if consume is GET-driven (D-14) — it legitimately appears in the `/auth/consume` request URL, exactly as an OAuth authorization code does. **The THREAT-07 negative test must assert the session-token value (`authjs.session-token` / `__Secure-…`) never appears in any client-constructed URL; it must NOT assert "no `code` in any URL"** (that would either be mis-specified or break the real consume transport under D-14-GET). Phase 4's threat-model entry for THREAT-07 must carry this token-vs-handle distinction so a `?code=` in the consume URL is not mis-flagged as a violation.
- **D-16 (middleware edge-runtime import isolation):** Next.js middleware executes in the **Edge runtime**. `createBridgeMiddleware` and its entire transitive import graph MUST be **edge-safe** — it reads request headers/cookies and returns a rewrite/`next()`, and MUST NOT import the transfer store, `@upstash/redis`, `node:crypto`, or any Node-only API. This argues for the middleware being a **separate, lightweight export**, not bundled into `createAuthBridge` (which pulls in the store). Its options (`allowedOrigins`, `cookieName`/`secure`, popup-entry path) come from the **same configuration source** as `createAuthBridge` (one source of truth) but are imported independently. **Test:** an import/bundle check (or a structural assertion) that the middleware module does not pull in the store / `node:crypto`.

### Amendments to existing decisions (review addendum)

- **D-07 (amend — comments must be self-contained):** the open-union documentation "at the type definition AND at each callsite" ships in `packages/` (OSS-bound). The comments MUST be **self-contained** about *why* the union is open (it may gain members in a future minor; handle known cases, default the rest; never an exhaustive `switch`/`assertNever`) and MUST NOT cite internal requirement IDs (`CLIENT-03` etc.) — those are `.planning`-only and would be dangling references in the published package.
- **D-08 (amend — lock `rewrite`, not redirect):** the embedded-routing mechanism is `NextResponse.rewrite` (URL unchanged, the popup-entry content is served in place), **not** a redirect — a redirect to the popup entry would trigger an extra navigation. The browser-context path is the normal Auth.js redirect / `next()` passthrough. The middleware returns a passthrough (`next()`/`undefined`) for all non-embedded-unauth cases so the app composes it ahead of its own matcher/Auth.js middleware (app owns `config.matcher`).
- **D-10 (amend — UX-only is structurally provable):** in addition to the forged-`Sec-Fetch-Dest` behavioural test, add a **structural assertion** that the middleware module contains **no `verifySession` call and no store access** (grep/import check) — proving it *cannot* be a security gate. Sharpen the behavioural test to: **vary only the detection signal** (`Sec-Fetch-Dest` present / absent / forged) at a fixed auth state and assert the **security outcome is invariant — only the UX target changes**.
- **D-11 (amend — honesty boundary of the bench):** the pure-Node E2E asserts the **data flow + the `Partitioned` attribute *emission*** on the `Set-Cookie` — it does **NOT** prove real CHIPS partition *enforcement* (Vitest/node cannot model the browser's partitioned cookie store). Real partition isolation is a **Phase 4 manual/browser** check (as already flagged Manual-Only in Phase 2 VALIDATION). State this explicitly so a green bench is not read as "partitioning works in a browser."
- **D-12 (amend — extract the security check as a pure predicate):** factor the wrong-origin/wrong-source rejection into a **pure predicate** (e.g. `isTrustedMessage(event, { allowedOrigins, expectedSource }): boolean`) taking a plain `MessageEvent`-shaped object, so the THREAT-03 negative test runs **with zero DOM and zero globals** — strictly stronger than driving it through an injected `window`. The DI seam (D-12) still covers the orchestration (`open`/`addListener`); the security assertion lives in the pure predicate.

### Claude's Discretion (left to research/planning)
- Exact public export names and file layout under `packages/core/src/` (the CLAUDE.md pointers name `popup-page.tsx`, `native-signin-page.tsx`, `middleware.ts` — see D-13's deviation; planner picks the actual v0.1 module names, e.g. `popup-flow.ts`, `open-auth-popup.ts`, `detect-context.ts`, `middleware.ts`).
- Exact timeout default for `openAuthPopup` (D-04) and the `window.open` window features / popup URL construction — behavior (reject on timeout, no token in URL) is locked, the numbers/strings are open.
- Precise shape of the injected-dependency seam (D-12) — a single `deps` object vs individual params; the invariant (no global `window` required in tests) is locked.
- Exact `4xx`/redirect mechanics the middleware emits per context (D-08) and how it composes with an app's own `config.matcher` / Auth.js middleware — the invariant (embedded -> popup entry, browser -> normal redirect, never a security gate) is locked.
- Whether `detectContext`'s `'pwa-shell'` arm needs any v0.1 code at all (it never returns it) — likely a pure type-level member plus the default-fallback test; planner confirms.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning & requirements
- `.planning/PROJECT.md` — Core Value (Mode A deeply correct, depth-over-breadth), v0.1.0 scope, Mode B -> v0.2 boundary, Key Decisions table.
- `.planning/REQUIREMENTS.md` — CLIENT-01..05 full text (incl. the CLIENT-03 open-union acceptance criterion and CLIENT-05 / THREAT-07 URL-hygiene property); the `THREAT-NN` namespace note.
- `.planning/ROADMAP.md` §"Phase 3: Client Helpers, Pages & Middleware" — the goal and the five success criteria this phase must make TRUE (note success criterion 5: first E2E flow green on the Vitest bench).
- `CLAUDE.md` — package conventions: factory functions / **no classes**, TypeScript `strict: true` / no `any` outside tests, Vitest with explicit negative cases (forged origin, replay), threat-model discipline (any change to bridge/consume/cookie/detection requires a threat-model update + negative test), no per-file license headers. **Architecture pointers** name `popup-page.tsx`, `native-signin-page.tsx`, `middleware.ts`, `auth-helpers.ts` — see D-13 for the intentional `.tsx` deviation (component deferred to the Phase 5 example app).

### Phase 2 context & the locked server contract (the seam this phase drives)
- `.planning/phases/02-bridge-consume-routes/02-CONTEXT.md` — the full server-side handoff decisions. Most relevant to Phase 3: **D-07** (bridge -> `200 { code }` JSON, handle never in a URL), **D-08** (consume -> `302` to `sanitizeNext`-validated `next`, bad/absent/replayed handle -> `4xx` no cookie), **D-12/D-14** (server-side `allowedOrigins` is the **complement** of this phase's client-side `postMessage` origin checks — D-02; absent-Origin passes to the real gate), **D-13** (consume is popup-only, sets the partitioned CHIPS cookie), **AM-2** (bridge sets zero cookies).
- `packages/core/src/bridge-route.ts` — the `createBridgeHandler` the Phase 3 flow fetches for `{ code }` (`200 { code }`, zero `Set-Cookie`).
- `packages/core/src/consume-route.ts` — the `createConsumeHandler` the **opener** drives (`?code=&next=` -> `302` + partitioned cookie); the bad/absent-handle `4xx`-no-cookie path.
- `packages/core/src/create-auth-bridge.ts` + `packages/core/src/types.ts` — `createAuthBridge` / `AuthBridgeOptions` (`store`, `verifySession`, `allowedOrigins`, optional `cookieName`/`secure`/`maxAge`). `allowedOrigins` is the shared list whose **client-side** counterpart this phase's `openAuthPopup` enforces (D-02).
- `packages/core/src/index.ts` — the public surface this phase extends with `openAuthPopup`, `runPopupFlow`, `detectContext`, `createBridgeMiddleware`, and the open-union context type.

### Phase 1 patterns reused
- `packages/core/src/transfer-store/in-memory.ts` — the dependency-free store the E2E roundtrip test injects (no KV on the bench).
- `packages/core/src/transfer-store/__tests__/contract.ts` — the **clock-seam / injectable-dependency** test pattern (`now()`) that D-12's browser-dependency seam mirrors.

### External research (researcher to confirm against live specs)
- **`postMessage` security** — `targetOrigin` must never be `'*'` for sensitive payloads; receiver must validate `event.origin` and `event.source`. Grounds D-02 / THREAT-03. Ref: MDN `Window.postMessage`.
- **`Sec-Fetch-Dest` header** — confirm `iframe` value for sub-frame navigations and browser support / non-spoofability for the middleware embedded signal (D-09). Ref: MDN Fetch Metadata Request Headers.
- **CHIPS partitioned cookies + cross-context (D-14 — the decisive item)** — confirm whether a **`fetch` issued from inside the iframe** applies a `Partitioned` `Set-Cookie` carried on the consume **302 redirect hop** into the *fetching context's* (iframe's) partition, **or** whether a **hard top-level navigation** is required for the cookie to be written to the iframe partition. This answer **selects fetch-vs-navigate (D-14)** and therefore whether the handle appears in the consume URL (D-15). Also confirm the opener-driven consume lands the cookie in the iframe's partition (top-level site = host), not the popup's. Ref: web.dev / MDN Partitioned cookies (CHIPS); test against Chrome's CHIPS behaviour for redirect-hop `Set-Cookie` in a partitioned fetch.
- **Next.js middleware** — confirm the Web-standard middleware shape and how `config.matcher` / Auth.js middleware compose, to validate D-10's factory packaging. **Also confirm the Edge-runtime import constraints (D-16):** what is unavailable in the Edge runtime (`node:crypto`, Node built-ins) so the middleware's transitive import graph stays edge-safe and never pulls in the store. Ref: Next.js middleware docs (via context7 / authjs.dev).

### To be authored later (not this phase)
- `docs/threat-model.md` — still does **not** exist (HARDEN-01 / Phase 4 writes it). Phase 3 produces the THREAT-03 (wrong-origin `postMessage`) and THREAT-07 (no-token-in-URL, client side) negative tests; reference these `THREAT-NN` IDs in test comments so the Phase 4 mapping stays traceable.
- `docs/architecture.md` — referenced by `CLAUDE.md` but not yet created; known doc gap, not Phase 3 scope.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createBridgeHandler` / `createConsumeHandler` / `createAuthBridge`** (`bridge-route.ts`, `consume-route.ts`, `create-auth-bridge.ts`) — the locked server contract Phase 3 drives. The E2E roundtrip test (D-11) calls these directly with `Request` objects.
- **`createInMemoryTransferStore`** (`transfer-store/in-memory.ts`) — the dependency-free store injected into the E2E roundtrip (no KV needed).
- **The clock-seam test pattern** (`transfer-store/__tests__/contract.ts`, injectable `now()`) — the established style D-12's browser-dependency injection mirrors (deterministic, no real timers/globals).

### Established Patterns
- **Factory functions, no classes** (CLAUDE.md + Phase 1/2 throughout). `openAuthPopup` / `runPopupFlow` / `detectContext` / `createBridgeMiddleware` follow this — closures over injected deps, no `this`.
- **Web-standard handlers / pure-Node bench** — Phase 2 chose `Request => Response` (D-06) precisely so the Phase 3 first-flow test drives the routes with plain `Request`s on a pure-Node bench. D-11 keeps that bench dependency-free.
- **Colocated negative tests** in `__tests__/` — every helper ships explicit security/negative cases (here: wrong-origin `postMessage` THREAT-03, forged `Sec-Fetch-Dest` UX-only proof CLIENT-04, no-token-in-URL THREAT-07).
- **`allowedOrigins` already in `AuthBridgeOptions`** — the same list the server routes use (D-12); the client `openAuthPopup` origin check (D-02) consumes the client-side counterpart, keeping one source of truth for trusted origins.

### Integration Points
- **Upstream:** the Phase 2 `/auth/bridge` (fetched for `{ code }`) and `/auth/consume` (driven by the opener) handlers.
- **Downstream:** **Phase 4** maps this phase's THREAT-03 / THREAT-07 negative tests into `docs/threat-model.md` and builds the full single-origin *integration* roundtrip on top of the D-11 bench flow. **Phase 5** authors the actual `/auth/popup` React component wrapping `runPopupFlow` (D-13) and exercises the live roundtrip on Vercel.

</code_context>

<specifics>
## Specific Ideas

- The user wants the **opener (iframe app), not the popup, to call `/auth/consume`** (D-01) — so the CHIPS partitioned cookie lands in the iframe's partition, which is the whole point of Mode A. This makes the `{ code }` a real bearer handle in transit and the `postMessage` origin/source check genuinely security-critical.
- The user wants the channel secured by **`targetOrigin` + `event.origin` allowlist + `event.source` identity, no nonce** (D-02) — the one-time-use short-TTL handle makes a nonce redundant ceremony.
- The user wants the package to **stay pure-Node / React-free for v0.1** (D-11/D-12/D-13) — the `.tsx` popup component is deferred to the Phase 5 example app, and all client helpers are tested via a dependency-injection seam rather than adding jsdom. The tested surface never touches a real `window`.
- The user wants the middleware to be **provably UX-only** (D-10) — a forged `Sec-Fetch-Dest` may only change *where* an already-unauthenticated user is routed, never *whether* they get access.

</specifics>

<deferred>
## Deferred Ideas

- **The actual `/auth/popup` `.tsx` React component** — deferred to the Phase 5 reference example app (D-13). v0.1 ships only the framework-agnostic `runPopupFlow(deps)`; this is an intentional deviation from the `popup-page.tsx` CLAUDE.md pointer, recorded in D-13.
- **`native-signin-page.tsx` / any Mode B client surface** — v0.2 (Mode B). The `'pwa-shell'` open-union member exists only as a type-level forward-compat stub (D-07); no v0.1 code returns or routes it.
- **jsdom / happy-dom DOM-realistic client tests** — considered and rejected for v0.1 (D-12); the DI seam tests the client helpers pure-Node. Could be added later if a more integration-style client test is wanted.
- **Nonce / handshake-token hardening on the `postMessage` channel** — considered and rejected (D-02) as redundant given the one-time-use short-TTL handle; revisit only if a concrete same-origin-racing threat emerges.
- **Host-specific embedded detection** (`document.referrer`, `ancestorOrigins`, per-host heuristics) — rejected for v0.1 (D-05); the binary iframe/browser signal suffices for UX routing.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (todo.match-phase returned 0).

</deferred>

---

*Phase: 3-Client Helpers, Pages & Middleware*
*Context gathered: 2026-06-08*
