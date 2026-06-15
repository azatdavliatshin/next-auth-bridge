# Phase 2: Bridge & Consume Routes - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 12 (6 new source, 4 new test, 4 modified)
**Analogs found:** 12 / 12 (all map onto Phase 1 transfer-store modules)

> The entire Phase 1 `transfer-store/` tree is the analog corpus. There is no
> prior HTTP-handler, factory-with-injected-deps, or contract-suite-test code
> anywhere else in the repo, so every new file copies its conventions from a
> Phase 1 module. Match quality below is judged against the **convention** an
> analog establishes (factory style, structural-typed injected deps, JSDoc-with-
> decision-IDs header, contract-suite test shape), not against domain similarity.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/core/src/create-auth-bridge.ts` | factory / config | request-response | `transfer-store/kv.ts` (factory + injected-dep options) | convention-exact |
| `packages/core/src/bridge-route.ts` | route handler | request-response | `transfer-store/in-memory.ts` (factory returning closures) | role-match |
| `packages/core/src/consume-route.ts` | route handler | request-response | `transfer-store/in-memory.ts` (factory returning closures) | role-match |
| `packages/core/src/auth-helpers.ts` | utility | transform | `transfer-store/generate-code.ts` (pure stateless helper module) | convention-exact |
| `packages/core/src/cookie-codec.ts` (optional) | utility | transform | `transfer-store/generate-code.ts` (pure stateless helper module) | convention-exact |
| `packages/core/src/types.ts` (route/options types) | model / types | n/a | `transfer-store/types.ts` (interface-only, JSDoc + decision IDs) | convention-exact |
| `packages/core/src/__tests__/bridge-route.test.ts` | test | request-response | `transfer-store/__tests__/in-memory.test.ts` | role-match |
| `packages/core/src/__tests__/consume-route.test.ts` | test | request-response | `transfer-store/__tests__/in-memory.test.ts` | role-match |
| `packages/core/src/__tests__/auth-helpers.test.ts` | test | transform | `transfer-store/__tests__/in-memory.test.ts` | role-match |
| `packages/core/src/__tests__/helpers.ts` (shared fixtures) | test fixture | n/a | `transfer-store/__tests__/fake-upstash-redis.ts` + `kv.test.ts` recording wrapper | role-match |
| **MOD** `packages/core/src/transfer-store/types.ts` | model / types | n/a | itself (reshape `TransferPayload`, D-01) | self |
| **MOD** `packages/core/src/index.ts` | config / barrel | n/a | itself (extend re-exports) | self |
| **MOD** Phase 1 tests (`contract.ts`, `in-memory.test.ts`, `kv.test.ts`) | test | n/a | themselves (update `{authCookieValue}` fixture → `{name,value}[]`) | self |

## Shared Conventions (apply to ALL new files)

Extracted from every Phase 1 module — these are non-negotiable per CLAUDE.md and consistently applied:

1. **File-header comment block** naming the requirement/decision IDs the file satisfies. Every source file opens with `// next-auth-bridge — <one-line purpose>.` then a security-rationale block citing `D-NN` / `THREAT-NN` / `ROUTE-NN`. See `in-memory.ts:1-23`, `generate-code.ts:1-8`, `kv.ts:1-22`.
2. **Factory functions, no classes.** Stateful things are `createX(options) => closure-object`; pure things are bare exported functions. No `class`/`new`/`this`. (`in-memory.ts:61`, `kv.ts`, `generate-code.ts:18`.)
3. **`import type` for type-only imports** (`verbatimModuleSyntax`). Always `.js` extension on relative imports. See `in-memory.ts:25-30`.
4. **Structural typing of injected deps** — model the minimal surface, never import a concrete vendor type. `KVRedisClient` (`kv.ts:42-51`) is the template for typing `verifySession`.
5. **Guard indexed access** (`noUncheckedIndexedAccess`) — chunk arrays and parsed-cookie maps yield `T | undefined`; guard or use optional chaining as `kv.test.ts:97` does (`sets[0]?.ex`).
6. **No `any` outside test scaffolding.** Test files may relax to `unknown`/casts and say so in their header (`contract.ts:17`, `in-memory.test.ts:12`).

## Pattern Assignments

### `packages/core/src/create-auth-bridge.ts` (factory, ROUTE-05 / D-10)

**Analog:** `transfer-store/kv.ts` — the canonical "factory with an injected, structurally-typed dependency + options-merge + construction-time guard" pattern.

**Structural-typed injected dependency** (copy the `KVRedisClient` shape for `VerifySession` and the `TransferStore` option) — `kv.ts:36-51`:
```typescript
// Type the injected dep by its minimal surface, NOT a vendor type.
export interface KVRedisClient {
  set(key: string, value: TransferPayload, opts: { ex: number }): Promise<unknown>;
  getdel<T>(key: string): Promise<T | null>;
}
```
For Phase 2 this becomes `export type VerifySession = () => Promise<unknown | null>;` (RESEARCH Pattern 1 — structural, version-agnostic) and an `AuthBridgeOptions` carrying `store: TransferStore`, `verifySession`, `allowedOrigins`, optional `cookieName` (D-11). Keep `getAuthCookieName`/`sanitizeNext` OUT of the factory return (D-11).

**Options-merge + factory-returns-named-handlers** (analog returns one closure; Phase 2 returns `{ bridge, consume }`) — `in-memory.ts:61-73`:
```typescript
export function createInMemoryTransferStore(
  options: TransferStoreOptions = {},
): TransferStore {
  const { ttlSeconds = MAX_TTL_SECONDS, now = Date.now } = options;
  if (ttlSeconds > MAX_TTL_SECONDS) { throw new Error(/* loud misconfig */); }
  // ...captured in closure...
  return { /* ... */ };
}
```
Mirror as `createAuthBridge(options): { bridge, consume }` — config captured in the closure, both handlers share it (D-10).

---

### `packages/core/src/bridge-route.ts` (route handler, ROUTE-01/02/04, D-05/06/07)

**Analog:** `transfer-store/in-memory.ts` — factory returning a closure that captures config; here the closure is a Web-standard `(request: Request) => Promise<Response>`.

**Closure-over-config + ordered, commented security steps** — model the gate ordering on `in-memory.ts:95-107`'s "do the security-critical step first, comment each invariant inline":
```typescript
// in-memory.ts consume(): delete-FIRST then validate; each step cites its decision.
const entry = store.get(code);
store.delete(code);            // atomic, before any await
if (entry === undefined) return null;
```
Bridge handler ordering (from RESEARCH diagram, each step commented with its ID): (1) origin allowlist check → reject (D-12); (2) `await verifySession()` → `401` no body on falsy (ROUTE-01/THREAT-04, RESEARCH Pattern 1); (3) harvest session-token chunks from the `Cookie` header (D-05); (4) `store.create(payload)`; (5) `200 { code }` JSON (D-07). Never branch the mint on a wrapper/context signal (anti-pattern, RESEARCH).

**`store.create` call** is exactly the Phase 1 contract — `create({...}) => { code }` (`types.ts:53`). Bridge supplies `payload`, never entropy.

**Harvest helper** (Claude's discretion — inline or in `cookie-codec.ts`) — use RESEARCH §"Harvesting session-token chunks" verbatim: match `name === base || (name.startsWith(base + ".") && /^\d+$/.test(suffix))`. Never sweep `*pkce*`/`*state*`/`*csrf*`/`*callback-url*` (Pitfall 2/3, ROUTE-04 needs no active code).

---

### `packages/core/src/consume-route.ts` (route handler, ROUTE-03, D-08/13)

**Analog:** `transfer-store/in-memory.ts` (closure factory) + the `null`-on-miss → rejection mapping from the `TransferStore` contract.

**`store.consume` → 4xx mapping** — the Phase 1 contract (`types.ts:55-63`) collapses not-found/expired/consumed to `null`; consume maps that to one rejection path:
```typescript
// types.ts consume contract: null on ANY miss, throw on operational failure.
consume(code: string): Promise<TransferPayload | null>;
```
Handler: `const payload = await store.consume(code); if (!payload) return <4xx, NO Set-Cookie>;` (D-08; recommended `400` per RESEARCH Open Q1, planner confirms). A thrown error is an operational `5xx` — distinct from the `null` security-miss.

**Factored cookie-writer (D-13)** — internal `serializeSetCookie(name, value, attrs)` taking the attribute set as input so v0.2 adds the non-partitioned path additively. Use RESEARCH Pattern 3 (hardened floors: `Secure; HttpOnly; SameSite=None; Path=/; Partitioned`). Emit **one `Headers.append('Set-Cookie', …)` per chunk** (RESEARCH Pattern 2 / Pitfall 1) — never comma-join. Then `302` to `sanitizeNext(next)`.

---

### `packages/core/src/auth-helpers.ts` (utility, ROUTE-06/THREAT-08, D-09/11)

**Analog:** `transfer-store/generate-code.ts` — a tiny, pure, stateless helper module with a decision-citing header and a single-responsibility exported function.

**Pure-function + header convention** — `generate-code.ts:1-20`:
```typescript
// next-auth-bridge — the single transfer-code entropy site (D-01).
// THREAT-02 (entropy): ... [rationale block citing IDs] ...
export function generateCode(): string {
  return randomBytes(32).toString("hex");
}
```
Author `sanitizeNext` (RESEARCH Pattern 4 — degrade unsafe → `/`, never error) and `getAuthCookieName` (RESEARCH §"getAuthCookieName resolution" — config override else secure-context default) in this same shape: pure functions, header citing ROUTE-06/THREAT-08/D-09/D-11, separately importable (D-11). Keep them OUT of the factory return.

---

### `packages/core/src/cookie-codec.ts` (optional utility, D-03/05)

**Analog:** `transfer-store/generate-code.ts` (pure stateless helpers). Hand-rolled `parseCookieHeader` + `serializeSetCookie` per RESEARCH §"Code Examples" (no `cookie` package — zero-dep ethos). Only create this file if the planner factors the codec out of the route files; otherwise the functions live inline in `bridge-route.ts`/`consume-route.ts`.

---

### `packages/core/src/types.ts` (route/options types, model)

**Analog:** `transfer-store/types.ts` — interface-only module, heavy JSDoc tying each field to a decision ID, no runtime code.

**Interface-with-decision-IDs convention** — `types.ts:36-64`. Author `AuthBridgeOptions`, `VerifySession`, and the harvested-chunk type here in the same style: each field's JSDoc cites the D-NN that motivates it; required-vs-optional split per D-11 (planner finalizes). Note: this is a NEW top-level `types.ts` distinct from `transfer-store/types.ts` (the latter is modified, see below).

---

### Test files — `__tests__/{bridge-route,consume-route,auth-helpers}.test.ts`

**Analog:** `transfer-store/__tests__/in-memory.test.ts` — drives the unit under test directly on the Vitest bench, header cites THREAT-NN for Phase 4 traceability, each `it()` is commented with its requirement/threat ID.

**Per-test ID comments + direct in-memory wiring** — `in-memory.test.ts:14-32`:
```typescript
import { describe, expect, it } from "vitest";
import { createInMemoryTransferStore } from "../in-memory.js";
// ... STORE-05 / THREAT-02 — explicit delete-on-read ...
```
Inject `createInMemoryTransferStore` as the route's `store` (no KV on the bench — RESEARCH test mandate). Drive handlers with plain `Request` objects (D-06). Read response cookies with `response.headers.getSetCookie()` (array), NEVER `.get('Set-Cookie')` (Pitfall 1). Tag security cases with `THREAT-04`/`THREAT-06`/`THREAT-08` comments. Required negative cases: no-session→401, no token/JWT-string in body (ROUTE-02), forged/consumed handle→4xx+no-cookie (THREAT-06), decoy csrf/pkce cookies excluded from harvest (D-05), every unsafe `next` → `/` (THREAT-08), disallowed Origin rejected (D-12).

**Clock seam** — where TTL matters, use the injected-`now` closure exactly as `in-memory.test.ts:65-71` (`let clock; ... now: () => clock; clock += …`). No real waits, no `vi.useFakeTimers`.

---

### `packages/core/src/__tests__/helpers.ts` (shared test fixtures)

**Analog:** `transfer-store/__tests__/fake-upstash-redis.ts` (a hand-built fake satisfying a structural interface) + the recording-wrapper builder in `kv.test.ts:48-67`.

**Builder-function convention** — `kv.test.ts:48-67` shows a factory returning a configured fake plus captured state:
```typescript
function createRecordingFake(now: () => number): { client: KVRedisClient; sets: RecordedSet[]; ... } {
  const inner = createFakeUpstashRedis(now);
  // ... wrap, capture, return ...
}
```
Author `makeRequest(url, { headers })`, `fakeVerifySession(session | null)`, and an in-memory-store wiring helper in this builder style — small, typed-by-structure, no classes.

---

## Modified Files

### `transfer-store/types.ts` — reshape `TransferPayload` (D-01)

Replace the provisional single-field shape (`types.ts:20-23`):
```typescript
export interface TransferPayload {
  authCookieValue: string;   // <-- REMOVE
}
```
with the array-of-chunks shape (D-01; RESEARCH Open Q3 recommends the bare array as the most literal read, no discriminator field):
```typescript
export type TransferPayload = Array<{ name: string; value: string }>;
```
Update the surrounding JSDoc (currently says "Provisional shape … Phase 2 finalizes") to reflect the finalized shape. Preserve the STORE-01 mode-agnostic invariant note. The `TransferStore` interface (`create`/`consume` signatures) does NOT change.

### `index.ts` — extend re-exports

Current barrel re-exports `TransferStore`/`TransferPayload`/`TransferStoreOptions` + `createInMemoryTransferStore` (`index.ts:8-17`). Add: `createAuthBridge`, `getAuthCookieName`, `sanitizeNext`, and the new option/`VerifySession` types. Keep the KV adapter OUT (subpath only — `kv.ts:13-16`). The `TransferPayload` re-export line is unchanged; only the shape it points to changes (D-01, internal pre-publish).

### Phase 1 test fixtures — update old payload shape (RESEARCH Runtime State Inventory)

The new `{name,value}[]` shape breaks three hard-coded fixtures. These are the load-bearing, planned breakages:
- `transfer-store/__tests__/contract.ts:35` — `const payload = { authCookieValue: … }` → array shape. AND `contract.ts:56` — `expect(Object.keys(got ?? {})).toEqual(["authCookieValue"])` must change to assert the new shape (e.g. each entry has exactly `name`+`value` keys, none matching `/mode|popup|pwa|native|transport/i`).
- `__tests__/in-memory.test.ts:35` — same `{ authCookieValue }` fixture → array.
- `__tests__/kv.test.ts:84,129,137-138` — `{ authCookieValue }` fixtures, the `typeof got?.authCookieValue` assertion, and the `Object.keys(...).toEqual(["authCookieValue"])` assertion all update to the array shape.

## No Analog Found

None. Every new file maps onto a Phase 1 convention analog. The two genuinely novel domains (Web-standard `Request => Response` handlers, CHIPS `Set-Cookie` serialization) have no codebase analog — for those the planner uses RESEARCH §Architecture Patterns (Patterns 2–4) and §Code Examples directly, while still wrapping the result in the Phase 1 factory/header/test conventions above.

## Metadata

**Analog search scope:** `packages/core/src/` (entire tree — the only source in the repo).
**Files scanned:** 10 source/test files + 2 upstream planning docs.
**Pattern extraction date:** 2026-06-05
</content>
</invoke>
