# Phase 3: Client Helpers, Pages & Middleware - Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 12 (6 source + 6 test, all new) + `index.ts` (modified)
**Analogs found:** 12 / 12 (every new file maps to an existing in-repo analog)

> Phase 3 is a pure-additive, zero-new-dependency phase. There is no "no analog found"
> case — the codebase already contains a precise analog for every shape this phase needs
> (factory-over-deps, injectable-clock seam, pure separately-importable helper, Web-standard
> `Request`-driven handler/test, open public-surface extension). The job is to COPY these,
> not invent. All analogs are recent (Phase 1/2) and authoritative.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/is-trusted-message.ts` | utility (pure predicate) | transform | `src/auth-helpers.ts` (`sanitizeNext`) | exact (pure, separately-importable, security-boundary helper) |
| `src/detect-context.ts` | utility (client detector) | transform | `src/auth-helpers.ts` (`getAuthCookieName`) | exact (pure, option/dep-driven, default-fallback) |
| `src/popup-flow.ts` (`runPopupFlow`) | service (client orchestrator) | request-response (fetch + postMessage) | `src/transfer-store/in-memory.ts` (clock-seam DI factory) + `bridge-route.ts` (fetch target) | role-match (factory-over-injected-deps) |
| `src/open-auth-popup.ts` (`openAuthPopup`) | service (client orchestrator) | event-driven (message listener → promise) | `src/transfer-store/in-memory.ts` (DI factory + closure) | role-match (DI seam, closure cleanup) |
| `src/middleware.ts` (`createBridgeMiddleware`) | middleware (factory) | request-response | `src/create-auth-bridge.ts` + `bridge-route.ts` (`create*(options) => fn`) | exact (factory-returning-handler, Web-standard `Request`) |
| `src/index.ts` | config (public surface) | — | `src/index.ts` (existing exports) | exact (same file, additive) |
| `src/__tests__/is-trusted-message.test.ts` | test | transform (zero-DOM) | `transfer-store/__tests__/contract.ts` + `consume-route.test.ts` (negative cases) | exact |
| `src/__tests__/detect-context.test.ts` | test | transform | `consume-route.test.ts` (case-loop) | exact |
| `src/__tests__/popup-flow.test.ts` | test | request-response | `consume-route.test.ts` + clock-seam | role-match |
| `src/__tests__/open-auth-popup.test.ts` | test | event-driven | clock-seam (`contract.ts`) + recording-store pattern | role-match |
| `src/__tests__/middleware.test.ts` | test | request-response + structural | `consume-route.test.ts` (Request-driven + recording wrapper) | exact |
| `src/__tests__/roundtrip.e2e.test.ts` | test (E2E) | request-response | `consume-route.test.ts` (the `round-trips chunks end-to-end` test, lines 333–382) | exact |

---

## Pattern Assignments

### `src/is-trusted-message.ts` (utility, pure predicate — D-12 amend, THREAT-03)

**Analog:** `src/auth-helpers.ts` (`sanitizeNext` — a pure, separately-importable, security-boundary predicate that degrades safely and is documented as a trust boundary).

**Copy these properties from the analog:**
- A bare exported `export function`, no class/factory, separately importable from the root (`auth-helpers.ts` lines 37, 78).
- Self-contained doc comment stating WHY it is a trust boundary (`auth-helpers.ts` lines 1–18). **Per D-07 amend: the shipped `/packages` comment MUST NOT cite internal requirement IDs (`CLIENT-03`, `THREAT-03`).** Note `sanitizeNext`'s header comment currently DOES cite `ROUTE-06 / THREAT-08` — do NOT replicate that ID-citing in Phase 3's shipped doc comments; keep the THREAT-NN tags in TEST comments only (the existing test files use them, e.g. `consume-route.test.ts` lines 5–24).

**Target shape** (from RESEARCH Pattern 2, grounded in the `auth-helpers` purity style):
```typescript
interface MessageEventLike { origin: string; source: unknown; data: unknown; }
export function isTrustedMessage(
  event: MessageEventLike,
  opts: { allowedOrigins: readonly string[]; expectedSource: unknown },
): boolean {
  if (!opts.allowedOrigins.includes(event.origin)) return false; // origin allowlist (D-02)
  if (event.source !== opts.expectedSource) return false;        // source identity (D-02)
  return true;
}
```
Note the `readonly string[]` allowlist type matches `AuthBridgeOptions.allowedOrigins` exactly (`types.ts` line 60) — one source of truth.

---

### `src/detect-context.ts` (utility, client detector — D-05/D-06/D-07, CLIENT-03)

**Analog:** `src/auth-helpers.ts` (`getAuthCookieName` — pure, options-driven, precedence/default-fallback branching, lines 78–86).

**Copy these properties:**
- Bare exported function with a default-valued parameter (the `win: WindowLike = window` injected-dep default mirrors `getAuthCookieName`'s opts-with-defaults and the store's `now = Date.now` default seam in `in-memory.ts` line 64).
- **If/else with a default branch, NEVER an exhaustive switch** (D-07). The open-union type and each callsite carry a self-contained comment explaining the union is intentionally open (RESEARCH Pattern 3/4). Do not cite `CLIENT-03`.
- try/catch wrapping the cross-origin `win.top` access (RESEARCH Pattern 4) — a thrown `SecurityError` confirms embedding → `'iframe'`.

**Public type** lives in `index.ts` (see public-surface section): `export type BridgeContext = "iframe" | "browser" | "pwa-shell";`

---

### `src/popup-flow.ts` — `runPopupFlow(deps)` (service, CLIENT-01)

**Analog (DI seam):** `src/transfer-store/in-memory.ts` — the canonical factory-over-injected-deps with closure-captured dependencies and real-default values (lines 61–69). This is the EXACT pattern D-12 says to mirror.

**Analog (fetch target + response shape):** `src/bridge-route.ts` lines 96–106 — `runPopupFlow` fetches `/auth/bridge` and reads `200 { code }` (opaque 64-hex handle, zero cookies). The `{ code }` JSON shape and `Content-Type: application/json` it consumes are emitted there.

**Copy from `in-memory.ts`:**
```typescript
// lines 61-69 — factory destructures injected deps with real-browser defaults,
// captured in the closure. Tests pass fakes; no global window required (D-12).
export function createInMemoryTransferStore(options: TransferStoreOptions = {}): TransferStore {
  const { ttlSeconds = MAX_TTL_SECONDS, now = Date.now } = options;
  ...
}
```
Apply identically: `runPopupFlow` takes a `deps` object (`fetch`, `opener.postMessage`, `hostOrigin`, optional `now`) with real-browser defaults.

**Core flow** (RESEARCH "Popup posting to the opener"): `await fetchDep("/auth/bridge")` → `{ code } = await res.json()` → `opener.postMessage({ source: "next-auth-bridge", type: "auth-success", code }, hostOrigin)` with an **explicit `targetOrigin`, never `'*'`** (D-02/D-03).

---

### `src/open-auth-popup.ts` — `openAuthPopup(deps)` (service, event-driven, CLIENT-02/D-04)

**Analog (DI + closure-cleanup):** `src/transfer-store/in-memory.ts` — closure captures the injected deps; the consume closure's "do work then clean up synchronously" discipline (lines 95–107) is the model for D-04's "clean up the message listener + close-poll interval on settle (success OR failure), no leaks."

**Analog (calls the pure predicate):** `src/bridge-route.ts` lines 61–64 show the origin-allowlist check inlined; Phase 3 instead delegates to `isTrustedMessage` (RESEARCH "Receiving + validating the popup message"):
```typescript
if (!isTrustedMessage(event, { allowedOrigins, expectedSource: popupWin })) return; // D-02
if (typeof event.data !== "object" || event.data === null) return;
const msg = event.data as { source?: string; type?: string; code?: string };
if (msg.source !== "next-auth-bridge") return;                  // namespace filter (D-03)
if (msg.type === "auth-success" && typeof msg.code === "string") { cleanup(); resolve({ code: msg.code }); }
else if (msg.type === "auth-error") { cleanup(); reject(new Error("auth-error")); } // typed rejection (D-04)
```
Returns a promise: resolve on `auth-success`; reject (typed/distinguishable) on `auth-error`, popup-closed poll, timeout. Timeout default is Claude's discretion.

---

### `src/middleware.ts` — `createBridgeMiddleware(options)` (middleware factory, D-08/D-09/D-10/D-16)

**Analog (factory shape):** `src/create-auth-bridge.ts` lines 38–46 and `bridge-route.ts` lines 53–56 — the `create*(options) => (request) => Response` closure-over-config shape `createBridgeMiddleware` MUST mirror (no class). Same explicit return-type annotation style.

**Analog (Request-header reading + early-return guards):** `bridge-route.ts` lines 57–64 / `consume-route.ts` lines 105–112 — read a header (`request.headers.get("Origin")`), branch, return a Web-standard `Response` early. Phase 3 reads `Sec-Fetch-Dest` the same way and returns `NextResponse.rewrite(...)` or passthrough.

**CRITICAL — D-16 import isolation (this is what makes the analog DIVERGE):**
`bridge-route.ts` imports `./auth-helpers.js`, `./cookie-codec.js`, and (transitively via the store) `node:crypto`. **`middleware.ts` MUST import NONE of these.** Its import graph must be store-free, `cookie-codec`-free, `node:crypto`-free, and must NOT import from the package root (`./index.js`, which re-exports the store). Options (`allowedOrigins`, `popupEntryPath`, app-supplied `isAuthenticated`) come from the same conceptual config source as `AuthBridgeOptions` but are a separate, lightweight options type — NOT `AuthBridgeOptions` itself (it carries `store`). Use a structural `RequestLike`/`NextRequest`-shaped type, not a hard `next` runtime import (mirrors the `types.ts` line 5–6 "no concrete framework type imported" discipline).

**Routing core** (RESEARCH Pattern 5): unauth + `Sec-Fetch-Dest === "iframe"` → `NextResponse.rewrite(new URL(popupEntryPath, req.url))` (URL unchanged, D-08 amend); everything else → passthrough (`next()`/`undefined`). Detection NEVER gates WHETHER, only WHERE.

---

### `src/index.ts` (public surface — additive)

**Analog:** the existing `index.ts` itself (lines 8–31) — the established additive-export style with grouped, commented `export` / `export type` blocks.

**Copy the existing pattern** (note `auth-helpers` are exported as bare functions, lines 25–26): add the four new exports + the open-union type alongside, e.g.:
```typescript
export { detectContext } from "./detect-context.js";
export { isTrustedMessage } from "./is-trusted-message.js";
export { openAuthPopup } from "./open-auth-popup.js";
export { runPopupFlow } from "./popup-flow.js";
export { createBridgeMiddleware } from "./middleware.js";
export type { BridgeContext } from "./detect-context.js"; // or co-located type file
```
**D-16 note:** per RESEARCH "Runtime State Inventory", the middleware stays in the MAIN entry as a separate symbol (NOT a new subpath export) — its isolation is enforced by its own import graph being store-free, not by a subpath boundary. Keep `.tsx`/React entirely out (D-13).

---

### Test files (`src/__tests__/*.test.ts`)

**Primary analog:** `src/__tests__/consume-route.test.ts` — the colocated negative-test style with a THREAT-NN-tagged header comment (lines 1–29), per-case `it("...")` blocks, a recording-wrapper to assert a dependency was/wasn't reached (lines 63–81), and a case-loop over hostile inputs (lines 218–235).

**Secondary analog (clock/DI seam):** `transfer-store/__tests__/contract.ts` lines 33–90 — the injectable-`now()` deterministic seam (no real timers, no globals) that D-12's browser-dep injection mirrors. Use this for `open-auth-popup.test.ts`'s timeout/poll cases (inject a fake clock/timer, never real waits).

**Shared fixtures:** extend `src/__tests__/helpers.ts` (RESEARCH Wave 0). It already exports `makeRequest` (plain `Request` factory, lines 27–35), `fakeVerifySession` (lines 46–48), and `makeTestStore` (lines 56–60). Add DI fakes here: a fake `window`/`open`, a fake message-bus/`addEventListener`, a fake popup `Window` for the `event.source` identity check. Keep the "builder functions, no classes, casts-to-`unknown`-allowed-in-test-scaffolding" style (helpers.ts lines 13–14).

**Per-test mappings:**
- `is-trusted-message.test.ts` — zero-DOM negative cases (wrong-origin, wrong-source). Model on `consume-route.test.ts` forged/replay cases (lines 143–176): assert the boolean directly, no DOM, no globals. Tag `// THREAT-03`.
- `detect-context.test.ts` — iframe/browser + unknown→default. Use the case-loop style (lines 218–235) over fake `window`-likes.
- `middleware.test.ts` — three concerns: (1) routing (`Sec-Fetch-Dest: iframe` → rewrite; else passthrough) via `makeRequest`-style Request fakes; (2) **forged-signal invariance** — vary ONLY `Sec-Fetch-Dest` at fixed auth state, assert security outcome invariant (model on the Origin-gate behavioural tests, lines 262–292); (3) **structural assertion** that the module imports no store / `verifySession` / `node:crypto` (D-10 amend — a grep/import-graph check; new structural style, no direct analog, keep it a simple source/graph read).
- `roundtrip.e2e.test.ts` — **the headline test.** Copy `consume-route.test.ts` lines 333–382 ("round-trips chunks end-to-end") almost verbatim, inserting the function-level `postMessage` simulation (pass `{ code }` from the bridge JSON response into the consume call) between bridge and consume. Read Set-Cookie via `getSetCookie()` ONLY (lines 123, 368 — never `.get("Set-Cookie")`, Pitfall). Assert `Partitioned` emission (line 379–381) + the THREAT-07 token-vs-handle distinction (D-15: assert the session-TOKEN value never appears in a client-constructed URL; do NOT forbid `?code=`). Add a comment stating the D-11 honesty boundary (emission asserted, real partition enforcement is a Phase 4 browser check).

---

## Shared Patterns

### Factory-over-injected-deps (closure, no class) — applies to ALL new source files
**Source:** `src/transfer-store/in-memory.ts` lines 61–69 (DI factory with real defaults) and `src/create-auth-bridge.ts` lines 38–46 (`create*(options) => fn`).
```typescript
export function createInMemoryTransferStore(options: TransferStoreOptions = {}): TransferStore {
  const { ttlSeconds = MAX_TTL_SECONDS, now = Date.now } = options; // real defaults, captured in closure
  ...
  return { /* closures over the captured deps — no this, no class */ };
}
```
**Apply to:** `runPopupFlow`, `openAuthPopup`, `createBridgeMiddleware`, `detectContext` (default-valued `win`).

### Pure separately-importable helper — applies to `isTrustedMessage`, `detectContext`
**Source:** `src/auth-helpers.ts` lines 37–65 (`sanitizeNext`), 78–86 (`getAuthCookieName`), exported from root in `index.ts` lines 25–26, and explicitly asserted "not on the factory return" in `consume-route.test.ts` lines 313–328.
**Apply to:** keep the pure predicate + detector as bare root exports, NOT bundled into any factory return.

### Web-standard `Request`-driven handler + colocated negative tests
**Source:** `bridge-route.ts` / `consume-route.ts` (`(request: Request) => Promise<Response>`) and `consume-route.test.ts` driving them with `makeRequest(...)`.
**Apply to:** `createBridgeMiddleware` (reads `request.headers.get(...)`, returns a Web-standard response) and all Request-driven tests. **Always read Set-Cookie via `getSetCookie()`** (`consume-route.test.ts` line 123) — never the folded `.get("Set-Cookie")`.

### Injectable clock/timer seam (deterministic, no real waits)
**Source:** `transfer-store/__tests__/contract.ts` lines 11–12, 33–90 + `in-memory.ts` line 64 (`now = Date.now`).
**Apply to:** `openAuthPopup`'s timeout + close-poll tests (inject a fake clock/timer; assert typed rejection without real waits).

### Shipped-comment hygiene (D-07 amend)
**Source:** the doc-comment density of `auth-helpers.ts` / `bridge-route.ts` is the right LEVEL, but note: shipped `/packages` source comments MUST be self-contained and MUST NOT cite internal requirement IDs (`CLIENT-NN`, `D-NN`). THREAT-NN tags belong in TEST comments only (where `consume-route.test.ts` already uses them).

## No Analog Found

None. Every Phase 3 file maps to an existing in-repo analog (the structural import-graph assertion in `middleware.test.ts` is the only genuinely new *test technique*, but it is a trivial source/graph read, not a new architectural pattern).

## Metadata

**Analog search scope:** `packages/core/src/**` (all 20 source + test files enumerated and the 9 most relevant read in full).
**Files scanned:** 20.
**Pattern extraction date:** 2026-06-08.
