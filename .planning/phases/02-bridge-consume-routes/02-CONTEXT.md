# Phase 2: Bridge & Consume Routes - Context

**Gathered:** 2026-06-05
**Revised:** 2026-06-05 — review addendum after RESEARCH/PLAN audit: added D-14..D-17 (Origin semantics, unhappy-path specification, cookie-name reachability, Max-Age) + two acceptance mandates (AM-1, AM-2). These close the under-specified bridge/consume failure paths surfaced in review; re-plan to fold them into the route tasks and threat register.
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **server-side handoff** of Mode A: the `/auth/bridge` and `/auth/consume` HTTP handlers plus the `auth-helpers` they depend on, all wired by a reusable config factory. Covers requirements **ROUTE-01 through ROUTE-06**.

- `/auth/bridge` mints an opaque handle (via the Phase 1 `transferStore.create()`) **only** after independently verifying a genuine Auth.js session — wrapper/context signals are never trusted (THREAT-04). It returns only the opaque handle, never a session token (ROUTE-02).
- `/auth/consume` exchanges a valid handle (via `transferStore.consume()`) and sets a CHIPS partitioned cookie (`partitioned: true`) with correct attributes (ROUTE-03), redirecting to a `sanitizeNext`-validated destination. A forged or already-consumed handle is rejected (THREAT-06).
- `auth-helpers` provides `getAuthCookieName` (resolves the Auth.js session-cookie prefix, incl. `__Secure-` and chunk suffixes) and `sanitizeNext` (rejects `/auth` and `/api/auth` targets — THREAT-08).
- A config factory (`createAuthBridge`) wires both routes from app options (store adapter, session verifier, cookie name, allowed origins).
- PKCE is Auth.js-managed; the bridge must not break it (ROUTE-04 / THREAT-05).

**Failure-path & Origin behaviour is fully specified** — see D-14 (absent-Origin allowed; allowlist is defense-in-depth), D-15 (empty harvest → `5xx`, no mint), D-16 (`secure` option makes the dev/non-prefixed cookie name reachable), D-17 (`Max-Age` omitted by default, optional override), and AM-1/AM-2. The planner MUST encode these as explicit tests and reflect D-14's "complementary control" framing in any threat-register entry for `allowedOrigins`.

**Out of scope (belongs to later phases):** the `/auth/popup` page, `openAuthPopup`, `detectContext`, and middleware (Phase 3 — CLIENT-*); the canonical `docs/threat-model.md` and full roundtrip integration test (Phase 4 — HARDEN-*); Mode B / PWA-shell anything (v0.2). Client-side `postMessage` origin checks are Phase 3 (CLIENT-02); this phase's `allowedOrigins` is the **server-side** complement.

</domain>

<decisions>
## Implementation Decisions

### TransferPayload Shape & Cookie Reconstitution
- **D-01:** `TransferPayload` becomes an **array of `{ name, value }` cookie entries** (not a single `authCookieValue`). The bridge captures **every** Auth.js session-token chunk (`__Secure-authjs.session-token.0`, `.1`, …) and consume re-sets each one. Correct for large/chunked JWTs and database-strategy sessions by construction — no silent truncation. Still **mode-agnostic** (no popup/PWA discriminator — preserves the Phase 1 STORE-01 forward-compat guarantee). This finalizes the field Phase 1 deliberately left provisional (Phase 1 D-04). The Phase 1 `index.ts` re-exports `TransferPayload`; updating its shape is an internal, pre-publish change (no released consumers).
- **D-02:** Consume writes each chunk with **mirrored source attributes + hardened security floors**: forces `Secure=true`, `HttpOnly=true`, `SameSite=None` (required for cross-context/iframe), `Path=/`, and `partitioned=true` (CHIPS). `Max-Age` mirrors the source session lifetime where known. *(Superseded in part by D-17: `Max-Age` is omitted by default and only set via an explicit optional `maxAge?` — do not attempt to read it from the request, D-03.)*
- **D-03 (nuance for planner):** A server reading the **incoming** `Cookie` header gets only `name=value` — browsers do **not** echo back `Secure`/`SameSite`/`Max-Age`. So "mirror captured attributes" means: capture name+value from the request; **reconstruct** the security attributes from known config/hardened defaults (D-02). Do not chase un-capturable attribute data from the request.

### Session Verification (ROUTE-01 / THREAT-04 — the core gate)
- **D-04:** The bridge verifies a real session via an **app-injected `verifySession` callback** wired into the config factory (the app supplies `() => auth()` from its own Auth.js instance, returning a session or null). **Bridge owns the security decision** (refuse — `401` — if no session); **app owns the mechanism** (its providers, strategy, Auth.js version). No Auth.js internals are duplicated in the package → version- and strategy-agnostic.
- **D-05:** After the verifier confirms a session, the bridge **harvests the raw cookie chunk bytes directly from the incoming request** — selecting every cookie matching the resolved Auth.js prefix (`getAuthCookieName` + `.0/.1` suffixes). The session already lives in the request that reached `/auth/bridge`; harvest it rather than asking the app to supply bytes. This keeps the verifier contract to a single question ("is there a session?") and puts chunk-harvesting correctness inside the package, not on every consumer.

### Handler Shape & Responses
- **D-06:** Handlers are **Web-standard `Request => Response`** (Fetch API), returned by the factory; the app re-exports them from its App Router `route.ts` (`export const GET = handlers.bridge`). Framework-version-agnostic and **testable on the Vitest bench with plain `Request` objects** (no Next.js runtime) — directly serves the Phase 3 "first end-to-end flow on the test bench" goal. A Pages-router / Next adapter is trivial to add later (not v0.1).
- **D-07:** `/auth/bridge` responds **`200` with JSON `{ code }`** on success (opaque handle only — ROUTE-02), **`401`** on the no-session refusal with no body detail. The handle **never appears in a URL** (strongest hygiene for THREAT-09/10; the popup client fetches it and forwards it). No redirect-with-`?code=` model.
- **D-08:** `/auth/consume` responds **`302` to the `sanitizeNext`-validated `next`** (default `/`) with the partitioned cookie(s) set on the response. Invalid / already-consumed handle → **`4xx`, no cookie**. (The store's `null`-on-miss collapses not-found/expired/consumed into one rejection path — Phase 1 D-03.)
- **D-09:** `sanitizeNext` **degrades** an unsafe target to the safe default `/` rather than erroring the whole flow — a forged `next` lands the user on home, not an error page. **But the negative test must still assert the unsafe target is never honored:** `/auth/...`, `/api/auth/...`, absolute URLs, and protocol-relative (`//evil`) targets all resolve to `/`, never to the attacker target (ROUTE-06 / THREAT-08).

### Config Factory API (ROUTE-05)
- **D-10:** A **single factory** `createAuthBridge(options) => { bridge, consume }` returns named Web-standard handlers. One wiring point, shared config, nothing instantiated twice — matches the no-class / factory-function convention. (Rejected separate `createBridge`/`createConsume` — forces the app to keep two configs of one handshake in sync.)
- **D-11:** `options` carries at least: `store` (the Phase 1 `TransferStore` adapter), `verifySession` (D-04), `allowedOrigins`, and optional `cookieName` (resolved by `getAuthCookieName`, with `__Secure-authjs.session-token` as the sensible default). Required vs optional-with-defaults to be finalized by the planner; helpers (`getAuthCookieName`, `sanitizeNext`) stay **separately importable**, not bundled into the factory return (keeps v0.1 public surface minimal).
- **D-12:** `allowedOrigins` is the **server-side Origin/CORS allowlist** for `/auth/bridge` and `/auth/consume` — requests from disallowed origins are rejected. It **complements** (does not replace) the Phase 3 client-side `postMessage` origin checks (CLIENT-02). *(See D-14 for the absent-Origin case and the "defense-in-depth, not boundary" framing — read D-14 before encoding this as a test or threat-register entry.)*
- **D-13:** Consume is **popup-only for v0.1** — it sets the partitioned CHIPS cookie and has **no `mode` parameter and no PWA branch**. The cookie-attribute logic is factored (an internal cookie-writer taking the attribute set as input) so v0.2 can add the regular-cookie path without reshaping the route. Matches PROJECT.md (Mode B → v0.2) and the depth-over-breadth Core Value; avoids a half-tested security branch.

### Origin Semantics & Unhappy Paths (review addendum)

These four decisions specify behaviour that D-01..D-13 left implicit. They were surfaced auditing the plans against the Phase 3 flow and the Phase 4 threat-model hand-off; locking them here keeps the failure-path invariants traceable rather than improvised at execution time.

- **D-14 (amends D-12 — `allowedOrigins` semantics, the absent-Origin case):** A request whose `Origin` header is **present and not in `allowedOrigins`** is rejected (`4xx`) on both routes. A request with **no `Origin` header is allowed through** to the real gate — top-level navigations legitimately carry no `Origin` (the popup's `302`-driven `/auth/consume` in Phase 3, and a same-origin GET to `/auth/bridge`), so rejecting on absent-Origin would break the Mode A flow **by construction**. `allowedOrigins` is therefore **defense-in-depth, not the security boundary**: the actual gates are `verifySession` on bridge (ROUTE-01/THREAT-04) and the one-time opaque handle on consume (THREAT-06). The Phase 4 threat-model must describe D-12 as a complementary control, **not** as "rejects before `store.consume`/mint" in the absolute. **Tests (both routes):** present-but-disallowed Origin → rejected (`4xx`); **absent** Origin → passes the Origin check and proceeds to the real gate.
- **D-15 (empty harvest = operational failure, not silent success):** After `verifySession` confirms a session, if chunk-harvesting (D-05) yields **zero** session-token cookies, the bridge returns a **`5xx` operational error and does NOT call `store.create`** — it must not respond `200 { code }` with an empty payload. A verified session with no harvestable cookie means the resolved cookie name does not match what is actually on the request (a `secure`/prefix or custom-name mismatch — see D-16); minting a handle that consume would turn into **zero** `Set-Cookie`s yields a silently-broken "successful" flow. `5xx` is distinct from the `401` no-session refusal (D-07) and the consume `4xx` bad-handle path (D-08), so the three failure modes stay separable. **Test:** verified session + a `Cookie` header containing no matching session-token chunk → `5xx`, `store.create` never called, no handle minted.
- **D-16 (cookie-name resolution must be reachable — `secure` option):** `AuthBridgeOptions` gains an optional **`secure?: boolean` (default `true`)** threaded into `getAuthCookieName` by both routes, so the secure-context default (`__Secure-authjs.session-token`) can be overridden to the non-prefixed dev/test name (`authjs.session-token`) **without** forcing a full `cookieName` override. This closes the gap where `getAuthCookieName({ secure: false })` was unit-tested but **unreachable from the factory** (the bridge passed only `{ cookieName }`), which is the direct cause of the D-15 empty-harvest mismatch on http/localhost. Precedence is unchanged: explicit `cookieName` wins (D-11); else `secure` selects the prefix; default `secure: true` keeps production correct. **Test:** a factory built with `secure: false` harvests the non-prefixed `authjs.session-token` chunks (and its consume re-sets them).
- **D-17 (resolves the D-02 `Max-Age` "where known" discretion):** v0.1 **omits `Max-Age`** on the re-set chunks by default, yielding **session-scoped** cookies — the conservative, correct-by-default behaviour for a transient handoff, and consistent with D-03 (the source `Max-Age` is **not** capturable from the incoming request, so it must never be guessed). `AuthBridgeOptions` MAY expose an optional **`maxAge?: number`** that, when provided, is passed through `serializeSetCookie` for all chunks. D-02's "mirror source lifetime where known" is satisfied **only** by this explicit optional override, not by reading an un-echoed request attribute. **Test:** default omits `Max-Age`; `maxAge` set → every emitted `Set-Cookie` carries `Max-Age=<n>`.

### Acceptance Mandates (planner MUST encode as explicit tests)

- **AM-1 (consume — absent/empty `code`):** An absent or empty `code` query param on `/auth/consume` takes the **same** rejection path as a forged handle — `4xx`, no `Set-Cookie`, and `store.consume` is **never invoked with a null/empty argument** (guard before the store call). Preserves the no-oracle property (D-08) and prevents a malformed-input crash. **Test:** `/auth/consume` with no `code` → `4xx`, empty `getSetCookie()`, store not reached.
- **AM-2 (bridge — PKCE non-interference is observable):** The ROUTE-04/THREAT-05 "never **written**" half of the invariant is asserted concretely: the bridge's success response sets **zero** cookies — `response.headers.getSetCookie()` is `[]`. Combined with the existing decoy-exclusion harvest test (the "never **read**" half), this makes non-interference observable end-to-end rather than argued.

### Claude's Discretion (left to research/planning)
- Exact required-vs-optional split and full type of the `createAuthBridge` options object (D-11) — now also carries optional `secure?` (D-16) and optional `maxAge?` (D-17).
- Exact cookie-parsing approach for harvesting request chunks (D-05) — hand-rolled vs a small parser; the invariant (capture all chunks matching the resolved prefix) is locked, the mechanism is open.
- The precise chunk-suffix matching (`.0`, `.1`, … and the unsuffixed base name). *(How `getAuthCookieName` derives the prefix is now resolved: `cookieName` override → else `secure` flag selects the prefix — D-16.)*
- Exact 4xx codes for the failure paths (e.g. `400` vs `401` on bad handle) — the behavior (reject, no cookie, no detail leak) is locked. Note the distinct codes now fixed by decision: `401` = no-session refusal (D-07); `4xx` = bad/absent handle (D-08/AM-1) and disallowed Origin (D-14); `5xx` = empty harvest (D-15) and store operational throw (Phase 1 D-13).
- ~~Whether PKCE preservation (ROUTE-04) needs any active code~~ **RESOLVED by RESEARCH:** satisfied purely by non-interference (the bridge harvests only `*.session-token` chunks and sets zero cookies — D-05/AM-2); no active code. The invariant is "bridge does not break Auth.js-managed PKCE."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning & requirements
- `.planning/PROJECT.md` — Core Value (Mode A deeply correct, depth-over-breadth), v0.1.0 scope, Mode B → v0.2 boundary, Key Decisions table.
- `.planning/REQUIREMENTS.md` — ROUTE-01..06 full text; the `THREAT-NN` namespace note (invariants live in architecture/threat-model docs, requirement IDs use category prefixes).
- `.planning/ROADMAP.md` §"Phase 2: Bridge & Consume Routes" — goal and the five success criteria this phase must make TRUE.
- `.planning/phases/01-transferstore-adapters/01-CONTEXT.md` — the **locked** `TransferStore` interface and its decisions (D-01..D-15): `create(payload) => {code}`, `consume(code) => payload|null`, `null`=security-miss / throw=operational-failure, atomic read-and-delete, mode-agnostic payload (STORE-01 forward-compat). Phase 2 fills in `TransferPayload`'s fields (Phase 1 D-04) **without reshaping the interface**.
- `CLAUDE.md` — package conventions: factory functions / **no classes**, TypeScript `strict: true` / no `any` outside tests, Vitest with explicit negative cases, Auth.js as a peer dependency, threat-model discipline (any change to bridge/consume/cookie/detection requires a threat-model update + negative test), no per-file license headers. Also the architecture pointers naming `bridge-route.ts`, `consume-route.ts`, `auth-helpers.ts`.

### Phase 1 source (the seam this phase builds on)
- `packages/core/src/transfer-store/types.ts` — `TransferStore`, `TransferPayload`, `TransferStoreOptions`. **`TransferPayload` shape changes here** (D-01: array of `{name,value}` chunks).
- `packages/core/src/index.ts` — main entry re-exports; the package public surface this phase extends with the route factory + helpers.
- `packages/core/src/transfer-store/in-memory.ts` — the test-bench adapter Phase 2 route tests run against.

### External research (researcher to confirm against live Auth.js)
- **Auth.js session-cookie naming & chunking** — confirm the current default cookie name(s) (`authjs.session-token` / `__Secure-authjs.session-token`) and the chunk-suffix scheme (`.0`, `.1`, …) for oversized JWTs, and how the prefix differs across `secure`/non-secure and custom `cookieName` config. Grounds D-01/D-05 and `getAuthCookieName`. Ref: https://authjs.dev/ (Auth.js is the peer dependency).
- **Auth.js `auth()` helper return contract** — confirm what `auth()` returns for an authenticated vs unauthenticated request, to type the `verifySession` callback (D-04).
- **PKCE handling** — confirm Auth.js owns the PKCE state/code-verifier cookies end-to-end so the bridge only needs to avoid disturbing them (ROUTE-04 / THREAT-05).

### To be authored later (not this phase)
- `docs/threat-model.md` — does **not** exist yet (greenfield; HARDEN-01 / Phase 4 writes it). Phase 2 produces the negative-case tests for THREAT-04 (session-independence), THREAT-06 (forged/replayed handle), THREAT-08 (sanitizeNext), and the ROUTE-02 no-token-in-body property. Test files should reference these THREAT-NN invariants in comments so the Phase 4 mapping is traceable.
- `docs/architecture.md` — referenced by `CLAUDE.md` ("read at session start") but also not yet created. Not blocking Phase 2; noted as a known doc gap.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`createInMemoryTransferStore`** (`packages/core/src/transfer-store/in-memory.ts`) — the dependency-free store the bridge/consume route tests inject (no KV needed on the Vitest bench).
- **The locked `TransferStore` interface** (`types.ts`) — bridge calls `create()`, consume calls `consume()`. The `null`/throw contract (Phase 1 D-03/D-13) maps directly onto consume's `4xx`-on-miss vs `5xx`-on-operational-failure response logic.
- **The clock seam / contract-suite test patterns** from Phase 1 (`__tests__/contract.ts`, injectable `now()`) are the established style for the route negative tests (deterministic, no real waits/timers).

### Established Patterns
- **Factory functions, no classes** (CLAUDE.md + Phase 1 throughout, incl. the recent `refactor(01)` converting adapters from classes to factories). `createAuthBridge` follows this — closures over config, no `this`.
- **Subpath/exports discipline** — Phase 1 set up `exports` (main + `./store/kv`). New route/helper modules live under the main entry; planner decides exact file layout under `packages/core/src/` per the CLAUDE.md pointers (`bridge-route.ts`, `consume-route.ts`, `auth-helpers.ts`).
- **Colocated negative tests** — every route handler/helper ships with explicit security/negative cases in `__tests__/` (forged handle, replay, no-session, malformed `next`).

### Integration Points
- **Phase 1 store** is the upstream seam (`create`/`consume`).
- **Phase 3** is the downstream consumer: the `/auth/popup` page fetches `/auth/bridge` for the `{ code }` and drives `/auth/consume`; `allowedOrigins` (D-12) feeds the client `postMessage` origin checks. The Web-standard handler shape (D-06) is chosen so the Phase 3 first-flow test can drive these routes with plain `Request` objects.
- **Phase 4** consumes this phase's negative tests when mapping `docs/threat-model.md` invariants → tests.

</code_context>

<specifics>
## Specific Ideas

- The user wants the payload to be **robust against chunked/oversized Auth.js JWTs from day one** (D-01) — enterprise tokens with many claims split across `.0/.1` cookies are a real failure mode, not a hypothetical; a single-value payload that silently truncates is unacceptable.
- The user wants the security gate to read as **"the app proves identity via its own `auth()`, the bridge decides to refuse"** (D-04) — the package never re-implements Auth.js token decryption on the security-critical path.
- The user wants the handle to **never touch a URL** (D-07) — JSON-body delivery over redirect-with-query-param, consistent with the project's no-token-in-URL discipline even though the handle is opaque.
- The user wants a forged `next` to **fail safe to `/`** (degrade, not error — D-09) while the negative test still proves the malicious target was never honored.

</specifics>

<deferred>
## Deferred Ideas

- **PWA-mode (regular, non-partitioned) cookie path in consume** — explicitly deferred to v0.2 (Mode B). D-13 factors the cookie-writer so this is an additive change, not a route reshape.
- **`mode` parameter / Mode B branch in the routes** — deferred to v0.2; kept out of the security-critical path until Mode B is validated on real iOS hardware (PROJECT.md).
- **Next.js / Pages-router adapter** for the handlers — v0.1 ships Web-standard handlers re-exported from App Router `route.ts`; a framework adapter is later/optional (D-06).
- **`docs/architecture.md`** authoring — referenced by CLAUDE.md but not yet created; noted as a doc gap, not Phase 2 scope (Phase 4 owns the threat-model doc).
- **Folding the helpers into the factory return** — considered and rejected for v0.1 (D-11); `getAuthCookieName`/`sanitizeNext` stay separately importable to keep the public surface minimal.

### Reviewed Todos (not folded)
- The Phase 1 carried todo (**tsup → tsdown build-tool migration**) was reviewed and **not folded** — it is explicitly Phase 6 (Release Engineering) scope and unrelated to route mechanics.

</deferred>

---

*Phase: 2-Bridge & Consume Routes*
*Context gathered: 2026-06-05*
