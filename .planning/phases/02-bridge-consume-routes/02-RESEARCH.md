# Phase 2: Bridge & Consume Routes - Research

**Researched:** 2026-06-05
**Domain:** Auth.js (NextAuth v5) session-cookie mechanics, CHIPS partitioned cookies, Web-standard Fetch handlers, OAuth PKCE preservation
**Confidence:** HIGH (cookie names verified against Auth.js source; CHIPS + Fetch-API semantics verified against MDN; PKCE behavior verified against Auth.js source defaults)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `TransferPayload` becomes an **array of `{ name, value }` cookie entries** (not a single `authCookieValue`). The bridge captures **every** Auth.js session-token chunk (`__Secure-authjs.session-token.0`, `.1`, …) and consume re-sets each one. Mode-agnostic (no popup/PWA discriminator — preserves STORE-01 forward-compat). Updating the Phase 1 re-exported `TransferPayload` shape is an internal pre-publish change (no released consumers).
- **D-02:** Consume writes each chunk with **mirrored source attributes + hardened security floors**: forces `Secure=true`, `HttpOnly=true`, `SameSite=None`, `Path=/`, and `partitioned=true` (CHIPS). `Max-Age` mirrors source session lifetime where known.
- **D-03:** A server reading the **incoming** `Cookie` header gets only `name=value` — browsers do **not** echo `Secure`/`SameSite`/`Max-Age`. "Mirror captured attributes" means: capture name+value from the request; **reconstruct** security attributes from config/hardened defaults (D-02). Do not chase un-capturable attribute data from the request.
- **D-04:** The bridge verifies a real session via an **app-injected `verifySession` callback** (app supplies `() => auth()`, returns session-or-null). **Bridge owns the security decision** (refuse — `401` — if no session); **app owns the mechanism**. No Auth.js internals duplicated → version- and strategy-agnostic.
- **D-05:** After the verifier confirms a session, the bridge **harvests the raw cookie chunk bytes directly from the incoming request** — every cookie matching the resolved Auth.js prefix (`getAuthCookieName` + `.0/.1` suffixes). Chunk-harvesting correctness lives inside the package, not on every consumer.
- **D-06:** Handlers are **Web-standard `Request => Response`** (Fetch API), returned by the factory; app re-exports them from App Router `route.ts`. Testable on the Vitest bench with plain `Request` objects (no Next.js runtime).
- **D-07:** `/auth/bridge` responds **`200` with JSON `{ code }`** on success (opaque handle only — ROUTE-02), **`401`** on no-session refusal with no body detail. The handle **never appears in a URL**. No redirect-with-`?code=` model.
- **D-08:** `/auth/consume` responds **`302` to the `sanitizeNext`-validated `next`** (default `/`) with partitioned cookie(s) set. Invalid / already-consumed handle → **`4xx`, no cookie**. Store's `null`-on-miss collapses not-found/expired/consumed into one rejection path (Phase 1 D-03).
- **D-09:** `sanitizeNext` **degrades** an unsafe target to safe default `/` rather than erroring. **But the negative test must still assert the unsafe target is never honored:** `/auth/...`, `/api/auth/...`, absolute URLs, protocol-relative (`//evil`) all resolve to `/`, never to the attacker target.
- **D-10:** A **single factory** `createAuthBridge(options) => { bridge, consume }` returns named Web-standard handlers. (Rejected separate `createBridge`/`createConsume`.)
- **D-11:** `options` carries at least: `store` (Phase 1 `TransferStore`), `verifySession` (D-04), `allowedOrigins`, and optional `cookieName` (resolved by `getAuthCookieName`, default `__Secure-authjs.session-token`). Required-vs-optional split finalized by planner; helpers (`getAuthCookieName`, `sanitizeNext`) stay **separately importable**, not bundled into the factory return.
- **D-12:** `allowedOrigins` is the **server-side Origin/CORS allowlist** for both routes. Complements (does not replace) Phase 3 client-side `postMessage` origin checks (CLIENT-02).
- **D-13:** Consume is **popup-only for v0.1** — partitioned CHIPS cookie, **no `mode` parameter, no PWA branch**. Cookie-attribute logic factored (internal cookie-writer taking the attribute set as input) so v0.2 adds the regular-cookie path additively.

### Claude's Discretion

- Exact required-vs-optional split and full type of the `createAuthBridge` options object (D-11).
- Exact cookie-parsing approach for harvesting request chunks (D-05) — hand-rolled vs small parser; invariant (capture all chunks matching resolved prefix) is locked, mechanism open.
- How `getAuthCookieName` derives the prefix (config value vs convention) + precise chunk-suffix matching (`.0`, `.1`, … and unsuffixed base).
- Exact 4xx codes for failure paths (`400` vs `401` on bad handle) — behavior (reject, no cookie, no detail leak) is locked.
- Whether PKCE preservation (ROUTE-04) needs active code or is satisfied purely by the bridge not touching Auth.js PKCE cookies.

### Deferred Ideas (OUT OF SCOPE)

- PWA-mode (regular, non-partitioned) cookie path in consume — v0.2 (Mode B).
- `mode` parameter / Mode B branch in routes — v0.2.
- Next.js / Pages-router adapter for handlers — later/optional.
- `docs/architecture.md` authoring — doc gap, Phase 4 owns threat-model doc.
- Folding helpers into the factory return — rejected for v0.1.
- tsup → tsdown migration — explicitly Phase 6 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROUTE-01 | `/auth/bridge` independently verifies a real Auth.js session before minting a handle (THREAT-04) | `verifySession` callback typed as `() => Promise<Session \| null>`; bridge refuses (401) on falsy return — verified `auth()` returns `Promise<Session \| null>`. Verifier runs BEFORE `store.create`; context/wrapper signals never consulted. |
| ROUTE-02 | `/auth/bridge` returns only an opaque handle — no session token in response or URL | Response is `200 { code }` JSON; handle is 64-hex from Phase 1 `generateCode`. Negative test asserts no `__Secure-authjs.session-token` substring or JWT-shaped string appears in body. |
| ROUTE-03 | `/auth/consume` exchanges a valid handle, sets CHIPS partitioned cookie with correct attributes (THREAT-06) | Verified `Set-Cookie` syntax: `Partitioned; Secure; SameSite=None; Path=/`. Each captured chunk re-set with hardened-floor attributes via `Headers.append('Set-Cookie', …)`. |
| ROUTE-04 | PKCE preserved through bridge handoff (Auth.js-managed; not broken by bridge) (THREAT-05) | Verified: PKCE/state cookies are SEPARATE short-lived (maxAge 900s) cookies consumed by Auth.js during the OAuth callback, BEFORE a session cookie exists. The bridge only touches `*.session-token*` cookies → cannot disturb PKCE. **No active code needed** — satisfied by not harvesting/setting PKCE cookies. |
| ROUTE-05 | Config factory wires routes with app options (cookie name, store, allowed origins) | `createAuthBridge(options) => { bridge, consume }` factory (D-10). |
| ROUTE-06 | `sanitizeNext` rejects redirect targets inside `/auth` and `/api/auth` (THREAT-08) | `sanitizeNext` degrades unsafe → `/`; rejects `/auth*`, `/api/auth*`, absolute URLs, protocol-relative `//evil`. |
</phase_requirements>

## Summary

This phase builds the two security-critical HTTP handlers on top of the locked Phase 1 `TransferStore`. The research confirmed all five external Auth.js unknowns against authoritative sources, and surfaced one non-obvious runtime pitfall (multiple `Set-Cookie` headers in the Fetch `Headers` API) that directly shapes the consume handler and its tests.

The core architecture is fully constrained by CONTEXT.md: Web-standard `Request => Response` handlers from a single `createAuthBridge` factory, an app-injected `verifySession` gate, raw-chunk harvesting from the incoming `Cookie` header, and a CHIPS-partitioned cookie writer. The package adds **zero new runtime dependencies** — Auth.js is a peer dependency (its types are only needed for the `verifySession` signature, and even that can be modeled structurally to avoid coupling), Node `crypto` already backs code generation, and cookie parsing/serialization is small enough to hand-roll (recommended) given the locked, narrow scope.

**Primary recommendation:** Hand-roll cookie parsing and `Set-Cookie` serialization (no `cookie` package), type `verifySession` structurally (`() => Promise<{ user?: unknown } | null>` or a minimal `Session`-like interface) to avoid hard-coupling to a specific Auth.js version, harvest chunks by the resolved prefix using a deterministic suffix match, and emit each chunk as a separate `Headers.append('Set-Cookie', …)` entry. Test the consume response with `response.headers.getSetCookie()`, never `.get('Set-Cookie')`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session existence check (ROUTE-01) | API / Backend (bridge handler) | App's Auth.js instance | Bridge owns the refuse decision (D-04); app owns the mechanism via injected `verifySession`. Security gate must be server-side. |
| Handle minting (ROUTE-02) | API / Backend (bridge handler) | Phase 1 store | Opaque handle from `store.create`; never client-side, never in URL. |
| Cookie-chunk harvesting (D-05) | API / Backend (bridge handler) | — | Raw bytes read from the incoming request's `Cookie` header server-side; the package owns chunk correctness. |
| Handle exchange + cookie set (ROUTE-03) | API / Backend (consume handler) | Phase 1 store | `store.consume` then `Set-Cookie` on the `Response`. Cookie attributes are a server decision (D-02/D-03). |
| Redirect-target validation (ROUTE-06) | API / Backend (`sanitizeNext`) | — | Open-redirect defense must be server-side; never trust the client-supplied `next`. |
| Origin allowlist (D-12) | API / Backend (both handlers) | Phase 3 client `postMessage` checks | Server-side CORS/Origin complement to the client-side check (CLIENT-02). |
| PKCE state | App's Auth.js instance | — | Owned entirely by Auth.js; the bridge's responsibility is purely *not to touch* it (ROUTE-04). |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (`randomBytes`) | built-in | (Already used by Phase 1 `generate-code.ts`) — no new use this phase | Platform CSPRNG; zero-dep. `[VERIFIED: codebase]` |
| Web Fetch API (`Request`, `Response`, `Headers`) | built-in (Node 18+/ES2022) | Handler signatures + cookie I/O (D-06) | Framework-agnostic; testable with plain `Request` objects. `[VERIFIED: codebase tsconfig target ES2022]` |
| `next-auth` (Auth.js) | v5 (peer dep) | **Types only** for `verifySession`'s return shape; not imported at runtime | Already the project's peer dependency. `[CITED: CLAUDE.md + PROJECT.md]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.1.8 (installed) | Route + helper negative tests | Already the test runner. `[VERIFIED: codebase package.json]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled cookie parse/serialize | `cookie` package (v1.1.1 on npm) [ASSUMED] | Adds a runtime dependency for ~30 lines of logic. The needed surface is narrow (parse `name=value` pairs from a `Cookie` header; serialize a `Set-Cookie` with a fixed attribute set). Hand-rolling keeps the dependency tree minimal (matches Phase 1's zero-dep ethos) and keeps the security-critical serialization fully auditable in-repo. **Recommend hand-roll.** |
| Importing Auth.js `Session` type | Structural minimal type `{ user?: unknown } & Record<string, unknown>` or `unknown`-returning `() => Promise<unknown \| null>` where the bridge only checks truthiness | Importing `next-auth`'s `Session` type couples the package's public type surface to a specific Auth.js major. Since the bridge only asks "is there a session?" (truthy/null — D-04), a structural/minimal type keeps it version-agnostic. **Recommend structural typing.** |

**Installation:**
```bash
# No new runtime dependencies for this phase.
# Auth.js stays a peer dependency (declared per PROJECT.md); used only for types if at all.
```

**Version verification note:** `npm view cookie version` → `1.1.1` `[VERIFIED: npm registry]` (only relevant if the planner overrides the hand-roll recommendation). No other package install is contemplated.

## Package Legitimacy Audit

> This phase installs **no new runtime packages**. The audit below covers the single alternative the planner might consider.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `cookie` | npm (v1.1.1) | mature (years) | very high (tens of M/wk) | github.com/jshttp/cookie | unavailable in session | Not recommended (hand-roll instead); registry-verified if used |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck could not execute in this session (`slopcheck install … --json` failed to produce output). Per protocol, treat the `cookie` package name as `[ASSUMED]` if the planner chooses to use it, and gate any install behind a `checkpoint:human-verify` task. The recommended path adds no packages, so this is moot under the default plan.*

## Architecture Patterns

### System Architecture Diagram

```
                         POPUP-MODE HANDOFF (Phase 2 scope)

  [Authenticated request to /auth/bridge]            [Request to /auth/consume?code=…&next=…]
   (carries authjs.session-token cookie chunks)        (from popup client, Phase 3)
                │                                                │
                ▼                                                ▼
   ┌─────────────────────────────┐                  ┌───────────────────────────────┐
   │  bridge handler (D-06,07)   │                  │  consume handler (D-06,08,13) │
   │                             │                  │                               │
   │ 1. Origin allowlist check ──┼─ reject ───┐     │ 1. Origin allowlist check ────┼─ reject (4xx)
   │    (allowedOrigins, D-12)   │            │     │    (allowedOrigins, D-12)     │
   │ 2. verifySession() (D-04) ──┼─ null ─► 401     │ 2. parse code + next (query)  │
   │    (app's () => auth())     │  (no body detail)│ 3. store.consume(code) ───────┼─ null ─► 4xx
   │ 3. harvest session-token    │                  │    (Phase 1 atomic delete)    │  (NO cookie set)
   │    chunks from Cookie hdr ──┼──┐               │ 4. sanitizeNext(next) (D-09) ─┼─► '/' if unsafe
   │    (getAuthCookieName +     │  │               │ 5. for each {name,value}:     │
   │     .0/.1 suffix match,D-05)│  │               │    Headers.append(            │
   │ 4. store.create(payload) ───┼──┼──► [Phase 1   │      'Set-Cookie',             │
   │ 5. 200 { code } (opaque)    │  │     Transfer   │      serialize(name,value,    │
   └─────────────────────────────┘  │     Store]     │       {Secure,HttpOnly,       │
                                     │       ▲        │        SameSite=None,Path=/,  │
        payload = [{name,value},…] ──┘       │        │        Partitioned}) (D-02))  │
        (mode-agnostic, D-01) ───────────────┘        │ 6. 302 → sanitized next       │
                                                      │    (Set-Cookie headers set)   │
                                                      └───────────────────────────────┘

  PKCE/state cookies (authjs.pkce.code_verifier, authjs.state): owned by Auth.js,
  consumed during OAuth callback BEFORE a session exists. Bridge never reads/writes
  them → PKCE preserved by non-interference (ROUTE-04). NOT in the harvested set.
```

### Recommended Project Structure

Follows CLAUDE.md architecture pointers (`bridge-route.ts`, `consume-route.ts`, `auth-helpers.ts`) and Phase 1's colocated-test convention. Final layout is the planner's call, but this matches the documented names:

```
packages/core/src/
├── create-auth-bridge.ts     # createAuthBridge factory (D-10) — wires bridge + consume
├── bridge-route.ts           # bridge handler builder (Request => Response)
├── consume-route.ts          # consume handler builder + internal cookie-writer (D-13)
├── auth-helpers.ts           # getAuthCookieName, sanitizeNext (separately importable, D-11)
├── cookie-codec.ts           # (optional) hand-rolled parseCookieHeader + serializeSetCookie
├── types.ts                  # AuthBridgeOptions, VerifySession, harvested-chunk types
├── index.ts                  # extend re-exports: createAuthBridge, helpers, new types
└── __tests__/
    ├── bridge-route.test.ts      # ROUTE-01/02, THREAT-04 negatives
    ├── consume-route.test.ts     # ROUTE-03, THREAT-06 negatives
    ├── auth-helpers.test.ts      # ROUTE-06/THREAT-08 (sanitizeNext), getAuthCookieName
    └── helpers.ts                # shared test builders (makeRequest, fakeVerifySession)
```

Note: `TransferPayload` in `transfer-store/types.ts` changes shape this phase (D-01) — from `{ authCookieValue: string }` to `Array<{ name: string; value: string }>` (or `{ cookies: Array<{name,value}> }` — planner picks; array-typed payload is the cleaner read of D-01). The Phase 1 contract suite (`__tests__/contract.ts`) hard-codes the old `payload = { authCookieValue: … }` and asserts `Object.keys(got) === ['authCookieValue']` — **this test will break and must be updated** as part of this phase. (See Runtime State Inventory.)

### Pattern 1: App-injected session verifier (the core gate)

**What:** The bridge never decodes a token. The app passes its own `auth()` as `verifySession`; the bridge calls it and refuses on a falsy result.
**When to use:** ROUTE-01 / THREAT-04 — every bridge request.
**Example:**
```typescript
// Structural, version-agnostic typing of the verifier (D-04).
// auth() returns Promise<Session | null> in Auth.js v5. [CITED: authjs.dev migrating-to-v5]
export type VerifySession = () => Promise<unknown | null>;

// In the bridge handler:
const session = await options.verifySession();
if (!session) {
  return new Response(null, { status: 401 }); // D-07: no body detail
}
// only now harvest + mint
```
The verifier takes no arguments in the simplest contract (app closes over its own request access via `auth()`); if the planner needs the request passed in for header access, that is a discretion call — but D-05 puts chunk-harvesting in the package from the *incoming* request the handler already holds, so the verifier can stay zero-arg.

### Pattern 2: Multiple Set-Cookie headers via append (NOT a single joined header)

**What:** Each harvested chunk becomes its own `Set-Cookie` header. `Set-Cookie` is special-cased in the Fetch `Headers` API.
**When to use:** ROUTE-03 — the consume response, especially with chunked JWTs (>1 cookie).
**Example:**
```typescript
// Source: MDN Headers.getSetCookie / Set-Cookie
const headers = new Headers();
headers.append("Set-Cookie", serializeSetCookie(chunk0.name, chunk0.value, attrs));
headers.append("Set-Cookie", serializeSetCookie(chunk1.name, chunk1.value, attrs));
// each append() is a SEPARATE header — append() does NOT comma-join Set-Cookie.
return new Response(null, { status: 302, headers /* + Location */ });
```

### Pattern 3: CHIPS partitioned Set-Cookie serialization (D-02 hardened floors)

**What:** A fixed, hardened attribute set on every chunk.
**Example:**
```typescript
// Verified attribute syntax — Source: MDN Set-Cookie + privacysandbox CHIPS
// Set-Cookie: __Secure-authjs.session-token=<chunk>; Path=/; Secure; HttpOnly; SameSite=None; Partitioned
function serializeSetCookie(name: string, value: string, opts: { maxAge?: number }): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=None",
    "Partitioned",
  ];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}
```
Note ordering of `Partitioned` is not significant; `Secure` is **mandatory** for `Partitioned` to be accepted by browsers, and `SameSite=None` + `Path=/` are the cross-context requirements. `[VERIFIED: MDN Set-Cookie + Privacy Sandbox CHIPS]`

### Pattern 4: `sanitizeNext` fail-safe degrade (D-09)

**What:** Unsafe target degrades to `/`; never errors the flow, never honors the attacker target.
**Example:**
```typescript
export function sanitizeNext(next: string | null | undefined): string {
  if (!next) return "/";
  // reject absolute + protocol-relative + non-path
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  // reject auth-namespace targets (case-insensitive, with trailing boundary)
  const lower = next.toLowerCase();
  if (lower === "/auth" || lower.startsWith("/auth/") ||
      lower === "/api/auth" || lower.startsWith("/api/auth/")) return "/";
  return next;
}
```
The negative test asserts each unsafe input resolves to `/` (never to the attacker target) — D-09.

### Anti-Patterns to Avoid

- **Trusting wrapper/context signals as the security gate:** ROUTE-01/THREAT-04 — context detection is UX routing only; the bridge must independently call `verifySession`. Never branch the mint decision on an `?popup=true` flag or header.
- **`headers.get('Set-Cookie')` to read cookies in tests:** comma-joins multiple cookies into one invalid string. Use `getSetCookie()`. `[VERIFIED: MDN]`
- **Setting all chunks as one comma-joined `Set-Cookie`:** invalid per HTTP spec; cookies are never comma-merged. Use `append()` per chunk. `[VERIFIED: MDN]`
- **Harvesting non-session cookies:** never sweep `authjs.pkce.code_verifier` / `authjs.state` / `authjs.csrf-token` / `authjs.callback-url` into the payload. Match only the session-token base + numeric chunk suffixes — anything else risks both breaking PKCE and leaking unrelated state.
- **Putting the handle in a URL:** D-07 — `200 { code }` JSON only.
- **Leaking failure detail:** 401/4xx with no body that distinguishes "no session" vs "bad handle" vs "expired" — collapses to one rejection path (Phase 1 D-03).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session validation / token decryption | A JWE/JWT decoder for `authjs.session-token` | App's injected `verifySession` (`() => auth()`) — D-04 | Re-implementing Auth.js token crypto on the security-critical path is exactly what D-04 forbids; it would couple to a strategy/version and is a prime correctness/foot-gun. |
| Code generation / entropy | A new `randomBytes` call in the bridge | Phase 1 `store.create()` (single entropy site, D-01) | One auditable entropy source already exists; the bridge supplies only the payload. |
| One-time-use / TTL / atomicity | Any re-check of expiry or delete logic | Phase 1 `store.consume()` (atomic delete-first, `null`-on-miss) | Phase 1 owns this; consume handler just maps `null` → 4xx. |
| Multiple Set-Cookie emission | Manual header-string concatenation with commas | `Headers.append('Set-Cookie', …)` per chunk | The Fetch API special-cases `Set-Cookie`; appending is correct and gives `getSetCookie()` round-trip in tests. |

**Key insight:** The two genuinely hard problems in this domain (session crypto and one-time-handle atomicity) are *deliberately* owned elsewhere (the app's Auth.js, and Phase 1). What remains for the package to own is narrow and mechanical — chunk harvesting by prefix and CHIPS-correct serialization — which is small enough to hand-roll and audit, but **must** be tested against the exact Auth.js cookie-name reality documented below.

## Runtime State Inventory

> This phase is partly a refactor: it reshapes the Phase 1 `TransferPayload` (D-01). Inventory of carried state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `TransferStore` holds transient ≤60s handles only; no persisted records carry the old `authCookieValue` shape across this change. In-memory store is per-process; KV TTL is ≤60s. | None (no migration). |
| Live service config | None — no external service stores this payload shape. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None — no secret/env references the payload shape. | None. |
| Build artifacts | `packages/core/dist/` (tsup output) will be stale after the new modules + type changes, but is rebuilt by `pnpm build`; not committed runtime state. | Rebuild on next `pnpm build` (no action in plan). |
| **Source contract coupling** | **`packages/core/src/transfer-store/__tests__/contract.ts`** hard-codes `payload = { authCookieValue: "…" }` and asserts `Object.keys(got) === ['authCookieValue']` (lines 35, 56). **`in-memory.test.ts` line 35 and `kv.test.ts`** use the same `{ authCookieValue }` fixture. | **Code edit:** update the contract suite + adapter test fixtures to the new `{name,value}[]` payload shape when D-01 lands. This is the load-bearing breakage from the type change — must be a planned task, not discovered at runtime. |
| **Public type re-export** | `index.ts` re-exports `TransferPayload`; its shape change is the documented internal pre-publish change (D-01, no released consumers). | **Code edit:** the type changes in `transfer-store/types.ts`; re-export line is unchanged but the shape it points to changes. |

**The canonical question — after every file is updated, what still references the old shape?** Answer: only the three test files above (contract + in-memory + kv fixtures). No runtime/stored/registered state carries the old shape. Verified by grep for `authCookieValue` across `src/`.

## Common Pitfalls

### Pitfall 1: Multiple Set-Cookie headers silently collapse
**What goes wrong:** Reading the consume response with `headers.get('Set-Cookie')` returns one comma-joined string; setting chunks by building one header string corrupts them. In some Node/undici/Next versions only the *last* `Set-Cookie` reaches the client when mis-emitted.
**Why it happens:** The Fetch `Headers` API special-cases `Set-Cookie` — it must not be comma-merged like other headers.
**How to avoid:** Emit each chunk with `headers.append('Set-Cookie', …)`; assert in tests with `response.headers.getSetCookie()` (an array). `getSetCookie()` is available in Node. `[VERIFIED: MDN getSetCookie]`
**Warning signs:** A test using `.get('Set-Cookie')` that "passes" with a single cookie but a chunked-JWT case where only one cookie appears.

### Pitfall 2: Harvesting the wrong cookies (prefix over-match)
**What goes wrong:** A naive `startsWith('authjs.session-token')` or `includes('authjs')` match sweeps `authjs.csrf-token`, `authjs.callback-url`, or — worse — interacts with the PKCE cookies. It can also fail to match the `__Secure-` prefixed name in production.
**Why it happens:** The session-token base name differs by secure context (`authjs.session-token` vs `__Secure-authjs.session-token`) and chunk names append `.0`, `.1`. The match must be: exact base name OR base name + `.` + integer.
**How to avoid:** Resolve the base via `getAuthCookieName` (config override or secure-context default), then match `name === base || name.startsWith(base + '.')` where the suffix is `^\d+$`. Reassemble in numeric-suffix order if the payload needs the concatenated value (Auth.js sorts by suffix and concatenates `[VERIFIED: next-auth source]`) — but D-01 stores the per-chunk `{name,value}` array and re-sets each, so reassembly is **not** required by the bridge; preserve the chunk names verbatim.
**Warning signs:** Test with two chunks (`.0`, `.1`) plus a decoy `__Secure-authjs.csrf-token` cookie; assert only the two session chunks are harvested.

### Pitfall 3: Disturbing PKCE cookies
**What goes wrong:** Treating PKCE preservation as something the bridge must actively carry.
**Why it happens:** Misreading ROUTE-04 as "transfer PKCE state."
**How to avoid:** Do nothing to PKCE. `authjs.pkce.code_verifier` and `authjs.state` are short-lived (`maxAge: 900s`) cookies consumed by Auth.js *during the OAuth callback*, before any session cookie exists. By the time `/auth/bridge` runs (post-login, session present), PKCE cookies are already gone. The bridge harvests only session-token cookies → it structurally cannot disturb PKCE. **ROUTE-04 needs no active code.** `[VERIFIED: next-auth source defaultCookies + CITED: nextauthjs discussion #8233]`
**Warning signs:** Any code path that reads or sets `*pkce*` / `*state*` cookies.

### Pitfall 4: `__Host-` prefix interaction (CSRF cookie) — informational
**What goes wrong:** Assuming all Auth.js cookies use `__Secure-`. The CSRF cookie uses the stricter `__Host-` prefix when secure.
**Why it happens:** Auth.js applies `__Host-authjs.csrf-token` (not `__Secure-`). `[VERIFIED: next-auth source]`
**How to avoid:** Irrelevant to harvesting (CSRF is not harvested) — but documents why an `includes('authjs')` match is dangerous. The session-token cookie uses `__Secure-` (or no prefix when non-secure). The consume response sets the session-token chunks only; it does not need `__Host-`.
**Warning signs:** n/a — informational, reinforces the exact-prefix match in Pitfall 2.

### Pitfall 5: `noUncheckedIndexedAccess` and `verbatimModuleSyntax`
**What goes wrong:** Project tsconfig sets `noUncheckedIndexedAccess: true` and `verbatimModuleSyntax: true`. Array/record indexing yields `T | undefined`; type-only imports must use `import type`.
**Why it happens:** Established Phase 1 config (verified in `packages/core/tsconfig.json`).
**How to avoid:** Guard indexed access (chunk arrays, parsed cookie maps); use `import type { … }` for the `TransferStore`/`Session` types (Phase 1 modules already do this).
**Warning signs:** TS2532 / TS1484 at build.

## Code Examples

### Parsing the incoming Cookie header (hand-rolled)
```typescript
// Source: pattern — RFC 6265 Cookie header is "name=value; name2=value2"
// Browsers send ONLY name=value pairs (D-03) — no attributes echoed back.
function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}
```

### Harvesting session-token chunks by resolved prefix (D-05)
```typescript
// base resolved by getAuthCookieName (config override OR secure-context default)
function harvestSessionChunks(
  cookies: Map<string, string>,
  base: string,
): Array<{ name: string; value: string }> {
  const chunks: Array<{ name: string; value: string }> = [];
  for (const [name, value] of cookies) {
    if (name === base || (name.startsWith(base + ".") && /^\d+$/.test(name.slice(base.length + 1)))) {
      chunks.push({ name, value });
    }
  }
  // Optional: sort by numeric suffix for stable order; not required for re-set correctness.
  return chunks;
}
```

### getAuthCookieName resolution (default vs override)
```typescript
// Default cookie names — Source: next-auth packages/core/src/lib/utils/cookie.ts
//   secure:     __Secure-authjs.session-token
//   non-secure: authjs.session-token
// [VERIFIED: next-auth source defaultCookies()]
function getAuthCookieName(opts: { cookieName?: string; secure?: boolean }): string {
  if (opts.cookieName) return opts.cookieName;          // explicit override (D-11)
  return opts.secure === false
    ? "authjs.session-token"
    : "__Secure-authjs.session-token";                  // sensible default (D-11)
}
```

### Reading cookies back in a consume test
```typescript
// Source: MDN Headers.getSetCookie — array, not comma-joined.
const res = await consume(new Request("https://app.test/auth/consume?code=" + code));
const setCookies = res.headers.getSetCookie();      // string[]
expect(setCookies.some(c => c.includes("Partitioned"))).toBe(true);
expect(setCookies.every(c => /Secure/.test(c) && /SameSite=None/i.test(c))).toBe(true);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-auth.session-token` cookie prefix (v4) | `authjs.session-token` / `__Secure-authjs.session-token` (v5) | NextAuth v5 / Auth.js rename | The package's default and `getAuthCookieName` target the `authjs.*` names. Legacy `next-auth.*` is NOT a v0.1 concern (the package targets Auth.js v5 as peer dep; no released consumers). `[VERIFIED: next-auth source + CITED: authjs.dev]` |
| Single `Set-Cookie` read via `headers.get` | `headers.getSetCookie()` array | Fetch spec addition (Node 18.14+/19.7+ stable) | Tests and any cookie-reading code must use `getSetCookie()`. `[VERIFIED: MDN]` |
| Third-party cookies for cross-context | CHIPS `Partitioned` cookies | Browsers shipping CHIPS (Chrome 114+, etc.) | The whole Mode A handoff depends on `Partitioned` for the iframe/popup context. `[VERIFIED: Privacy Sandbox CHIPS]` |

**Deprecated/outdated:**
- `next-auth.*` cookie prefix — replaced by `authjs.*` in v5. Do not default to or special-case the legacy prefix for v0.1.
- Reading `Set-Cookie` via `.get()` — use `.getSetCookie()`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cookie` npm package is v1.1.1 / legitimate (only if planner overrides hand-roll) | Standard Stack / Audit | Low — recommendation is to hand-roll; package unused under default plan. slopcheck did not run, so name is `[ASSUMED]`. |
| A2 | The `verifySession` contract can be zero-argument (`() => Promise<Session\|null>`) because the bridge harvests chunks from the request it already holds (D-05) | Pattern 1 | Low-Med — if the planner decides the verifier needs the `Request` passed in (e.g. for an app that can't close over request context), the signature gains a `Request` param. Behavior unchanged. |
| A3 | `Max-Age` "mirror source lifetime where known" (D-02) is satisfied by an optional config value or omitted (session cookie behaves as session-scoped if absent) | Pattern 3 | Low — D-02 says "where known"; omitting `Max-Age` yields a session cookie, an acceptable conservative default. Planner picks whether to expose a `maxAge` option. |

**Note:** All Auth.js cookie names, the `auth()` return contract, CHIPS attribute requirements, and the Fetch `Set-Cookie` semantics are `[VERIFIED]` / `[CITED]`, not assumed.

## Open Questions

1. **Exact 4xx code for a bad/consumed handle on consume (Claude's Discretion).**
   - What we know: behavior is locked (reject, no cookie, no detail leak — D-08). `null` from `store.consume` collapses not-found/expired/consumed.
   - What's unclear: `400` (malformed/absent code) vs `404`/`403` (valid-shaped but missing). A single code is cleaner for the no-oracle property.
   - Recommendation: `400 Bad Request` for any non-resolving code (no distinction between malformed and not-found — preserves the no-oracle property). Reserve `401` for the bridge's no-session refusal (D-07) so the two failure modes are not conflated. Planner to confirm.

2. **`verifySession` argument shape (links to A2).**
   - What we know: app supplies `() => auth()`.
   - What's unclear: zero-arg vs `(request: Request) => …`.
   - Recommendation: zero-arg (app closes over its own context); revisit only if a consumer constraint surfaces.

3. **Payload type literal: `Array<{name,value}>` vs `{ cookies: Array<{name,value}> }`.**
   - What we know: D-01 says "array of `{name,value}` cookie entries"; STORE-01 forbids mode discriminators.
   - Recommendation: bare `Array<{name: string; value: string}>` is the most literal read and carries no extra field that could be mistaken for a discriminator. Planner decides; either satisfies D-01.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node Fetch API (`Request`/`Response`/`Headers`/`getSetCookie`) | D-06 handlers + tests | ✓ (ES2022 target, Node 18.14+) | built-in | — |
| `node:crypto` | (Phase 1 only; not newly used) | ✓ | built-in | — |
| Vitest | Negative tests | ✓ | ^4.1.8 | — |
| `next-auth` (Auth.js) | Types for `verifySession` (optional) | ✗ (peer dep, not installed in lib) | — | Structural typing — no install needed |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** `next-auth` types — use structural/minimal typing (recommended regardless, for version-agnosticism).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.8 (`environment: "node"`) |
| Config file | `packages/core/vitest.config.ts` (`include: ["src/**/*.test.ts"]`) |
| Quick run command | `pnpm test` (from `packages/core`, runs `vitest run`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUTE-01 | No session → 401, no handle minted; wrapper signal ignored | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ❌ Wave 0 |
| ROUTE-02 | Success → `200 {code}`; body contains no token / no JWT-shaped string | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ❌ Wave 0 |
| ROUTE-03 | Valid handle → 302 + partitioned Set-Cookie per chunk (Secure/HttpOnly/SameSite=None/Path=//Partitioned) | unit | `pnpm test src/__tests__/consume-route.test.ts` | ❌ Wave 0 |
| ROUTE-03 (neg) | Forged/consumed handle → 4xx, NO Set-Cookie | unit | `pnpm test src/__tests__/consume-route.test.ts` | ❌ Wave 0 |
| ROUTE-04 | Bridge never reads/writes `*pkce*`/`*state*` cookies (PKCE not disturbed) | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ❌ Wave 0 |
| ROUTE-05 | `createAuthBridge(options)` returns `{ bridge, consume }` wired from shared config | unit | `pnpm test src/__tests__/*.test.ts` | ❌ Wave 0 |
| ROUTE-06 | `sanitizeNext` degrades `/auth*`, `/api/auth*`, absolute, `//evil` → `/`; never honors target | unit | `pnpm test src/__tests__/auth-helpers.test.ts` | ❌ Wave 0 |
| D-05 | Harvest only session-token base + `.N` chunks; decoy csrf/pkce cookies excluded | unit | `pnpm test src/__tests__/bridge-route.test.ts` | ❌ Wave 0 |
| D-12 | Disallowed Origin → rejected on both routes | unit | `pnpm test src/__tests__/*.test.ts` | ❌ Wave 0 |
| (regression) | Phase 1 contract suite updated to new `{name,value}[]` payload still passes | unit | `pnpm test src/transfer-store/__tests__/` | ✏️ existing — must update |

### Sampling Rate
- **Per task commit:** `pnpm test src/__tests__/<file>.test.ts` (the touched file)
- **Per wave merge:** `pnpm test` (full core suite — includes updated Phase 1 contract tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/bridge-route.test.ts` — covers ROUTE-01, ROUTE-02, ROUTE-04, D-05
- [ ] `src/__tests__/consume-route.test.ts` — covers ROUTE-03 (+negatives), THREAT-06
- [ ] `src/__tests__/auth-helpers.test.ts` — covers ROUTE-06/THREAT-08, getAuthCookieName
- [ ] `src/__tests__/helpers.ts` — shared `makeRequest`, `fakeVerifySession`, in-memory store wiring
- [ ] Update `src/transfer-store/__tests__/contract.ts` + `in-memory.test.ts` + `kv.test.ts` fixtures to new `TransferPayload` shape (D-01)
- Framework install: none — Vitest already configured.

*Test style mandate (from Phase 1): inject `createInMemoryTransferStore` (no KV); use the clock seam where TTL matters; deterministic, no real waits; tag security tests with `THREAT-04`/`THREAT-06`/`THREAT-08` comments for Phase 4 traceability.*

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | App-injected `verifySession` (`() => auth()`); bridge refuses (401) without a real session — never trusts context (ROUTE-01/THREAT-04). No credential handling in the package. |
| V3 Session Management | yes | Session-token cookies re-set with hardened floors: `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, `Path=/` (D-02). One-time ≤60s opaque handle mediates transfer (Phase 1). No session token in URL/body (ROUTE-02). |
| V4 Access Control | partial | Server-side `allowedOrigins` allowlist on both routes (D-12). Open-redirect control via `sanitizeNext` (ROUTE-06/THREAT-08). |
| V5 Input Validation | yes | `code` (64-hex handle), `next` (path-only, `/auth`/`/api/auth`/absolute/`//` rejected), `Origin` header validated against allowlist. |
| V6 Cryptography | yes (delegated) | Handle entropy is Phase 1's single CSPRNG site (`randomBytes(32)`). Session-token crypto owned entirely by Auth.js — **never hand-rolled** (D-04). |
| V7 Error Handling/Logging | yes | No detail-leaking error bodies (401/4xx with collapsed miss reasons — D-07/D-08); no oracle distinguishing miss modes (Phase 1 D-03). |

### Known Threat Patterns for Auth.js cross-context bridge

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged "I'm in a wrapper" signal to mint a handle without auth | Spoofing / Elevation | `verifySession` gate runs first and independently; context signals never gate the mint (ROUTE-01/THREAT-04). |
| Handle guessing/forgery | Spoofing | 256-bit CSPRNG opaque handle (Phase 1 STORE-04). |
| Handle replay | Tampering | One-time-use atomic delete-first; second `consume` → `null` → 4xx (Phase 1 STORE-05; THREAT-06). |
| Session token exposed in URL/logs | Information Disclosure | Handle-only `200 {code}` JSON; no token in body/URL (ROUTE-02; THREAT-09/10 closed at roundtrip in Phase 4). |
| Open redirect via `next` | Tampering | `sanitizeNext` rejects `/auth*`, `/api/auth*`, absolute, protocol-relative → `/` (ROUTE-06/THREAT-08). |
| PKCE/state cookie disturbance | Tampering | Bridge harvests only session-token cookies; PKCE/state are separate, already-consumed cookies (ROUTE-04/THREAT-05). |
| Cross-site cookie not honored in iframe/popup partition | Denial of intended function | `Partitioned` (CHIPS) + `SameSite=None; Secure` (ROUTE-03; D-02). |
| Cross-origin request to bridge/consume | Spoofing | `allowedOrigins` server-side allowlist (D-12). |

## Sources

### Primary (HIGH confidence)
- `next-auth` source `packages/core/src/lib/utils/cookie.ts` (`defaultCookies()`) — exact default cookie names + `__Secure-`/`__Host-` prefixes + chunk suffix scheme (`.0`,`.1`; 3936-byte per-chunk limit). https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/lib/utils/cookie.ts
- MDN — `Set-Cookie` header (Partitioned/CHIPS requires `Secure`; `SameSite=None`; `Path=/`). https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
- MDN — `Headers.getSetCookie()` (multiple Set-Cookie via `append`, not comma-joined; available in Node). https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie
- Privacy Sandbox — CHIPS (`Partitioned` must be `Secure` + `Path=/`; partition key = top-level site). https://privacysandbox.google.com/cookies/chips
- Codebase: `packages/core/{tsconfig.json,vitest.config.ts,package.json}`, `transfer-store/{types.ts,in-memory.ts,generate-code.ts}`, `__tests__/contract.ts`.

### Secondary (MEDIUM confidence)
- authjs.dev — Migrating to v5 (`auth()` returns `Session | null`; universal usage). https://authjs.dev/getting-started/migrating-to-v5
- authjs.dev — Core reference (`cookies` config override). https://authjs.dev/reference/core
- nextauthjs/next-auth Discussion #8233 — PKCE/state cookies `maxAge: 900`, separate from session, consumed at callback. https://github.com/nextauthjs/next-auth/discussions/8233

### Tertiary (LOW confidence)
- General CHIPS overviews (cookie-script, namesilo) — corroborating only; superseded by MDN/Privacy Sandbox.

## Metadata

**Confidence breakdown:**
- Standard stack (zero new deps; structural typing): HIGH — verified against codebase config and Auth.js peer-dep status.
- Auth.js cookie names + chunking: HIGH — verified against next-auth source `defaultCookies()`.
- `auth()` return contract: HIGH — `Promise<Session | null>` confirmed across migration docs + multiple sources.
- CHIPS `Set-Cookie` attributes: HIGH — verified against MDN + Privacy Sandbox.
- Fetch `Set-Cookie`/`getSetCookie` semantics: HIGH — verified against MDN.
- PKCE non-interference: HIGH — PKCE/state are separate short-lived cookies consumed at callback (source + discussion).
- Architecture/patterns: HIGH — fully constrained by CONTEXT.md locked decisions; research only confirmed externals.

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable; Auth.js cookie naming and CHIPS are settled. Re-verify if Auth.js ships a major or CHIPS `Partitioned` syntax changes.)
