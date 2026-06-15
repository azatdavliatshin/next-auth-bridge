# Phase 5: Multi-Tenant Reference Example - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 18 (new/modified example + CI files)
**Analogs found:** 14 / 18 (the package's own surface is the integration contract; 4 App-Router-shaped files are greenfield — no in-repo Next.js app exists yet)

> **DISCREET MANDATE (applies to every file below):** the example app and its CI ship in the OSS repo. NO internal requirement IDs (`D-NN`, `THREAT-NN`, `CLIENT-NN`, `EXAMPLE-NN`, `HARDEN-NN`) may appear in any committed `examples/` or `.github/` source or comment. The analog files in `packages/core/src/` are **saturated with these IDs in their comments** — when copying a pattern, copy the *structure and code*, NOT the planning-ID-laden comments. Re-explain on the demo's own terms. (`THREAT-NN` only where legitimately citing `docs/threat-model.md` as published docs.)
>
> **NO CLASSES:** project-wide functional/factory style. Example-local helpers are closures-over-deps, not `class … implements`. (One exception already in the package surface: `OpenAuthPopupError extends Error` — a typed error is acceptable; do not generalize it to other code.)
>
> **TypeScript `strict: true`, no `any`** outside test scaffolding. Vitest with explicit negative cases.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `examples/<app>/lib/auth-bridge.ts` (mounts `createAuthBridge`) | config/wiring | request-response | `packages/core/src/create-auth-bridge.ts` + `transfer-store/kv.ts` | exact (integration contract) |
| `examples/<app>/app/auth/bridge/route.ts` | route | request-response | `create-auth-bridge.ts` (`bridge` handler signature) | role-match (greenfield App Router shell over exact contract) |
| `examples/<app>/app/auth/consume/route.ts` | route | request-response | `consume-route.ts` (`consume` handler signature) | role-match (greenfield App Router shell over exact contract) |
| `examples/<app>/app/api/auth/[...nextauth]/route.ts` | route | request-response | (Auth.js v5 `handlers` — no in-repo analog) | no analog (RESEARCH Pattern 1) |
| `examples/<app>/auth.ts` (NextAuth config) | config | request-response | (Auth.js v5 — no in-repo analog) | no analog (RESEARCH Pattern 1) |
| `examples/<app>/app/auth/popup/page.tsx` (D-13) | component (React) | event-driven (postMessage) | `popup-flow.ts` (`runPopupFlow` deps contract) | exact (integration contract) |
| `examples/<app>/lib/consume-transport.ts` (D-10 seam) | utility | request-response | `consume-route.ts` query-string contract + project closure style | role-match |
| opener sign-in component (embedded iframe app) | component (React) | event-driven (postMessage) | `open-auth-popup.ts` (`openAuthPopup` deps contract) | exact (integration contract) |
| `examples/<app>/middleware.ts` | middleware | request-response (Edge) | `middleware.ts` (`createBridgeMiddleware` contract) | exact (integration contract) |
| `examples/<app>/app/t/[tenant]/page.tsx` | component (React) | request-response (SSR) | (no in-repo analog) | no analog (D-08 minimal UI) |
| `examples/<app>/app/t/[tenant]/manifest.webmanifest/route.ts` | route | request-response | `consume-route.ts` (raw `Response` + explicit headers idiom) | partial (RESEARCH Pattern 5) |
| `examples/<app>/app/install-pwa/page.tsx` (inert) | component (React) | static | (no in-repo analog) | no analog (D-07 inert label) |
| `examples/<host-shell>/app/page.tsx` (separate origin) | component (React) | static (cross-site iframe host) | (no in-repo analog) | no analog (D-09) |
| `examples/<app>/tests/manifest.test.ts` | test | request-response | `__tests__/consume-route.test.ts` (negative-case style) | role-match |
| `examples/<app>/tests/keycloak-roundtrip.test.ts` | test | request-response | `__tests__/roundtrip.e2e.test.ts` (full handoff drive) | role-match |
| browserless PKCE login helper | utility | request-response | (no in-repo analog) | no analog (RESEARCH Pattern 4) |
| `examples/<app>/package.json` + `tsconfig` | config | — | `packages/core/package.json` (exports/peer-dep idiom) | partial |
| `.github/workflows/keycloak-agnosticism.yml` | config (CI) | — | (no in-repo workflow analog) | no analog (RESEARCH Validation) |

## Pattern Assignments

### `examples/<app>/lib/auth-bridge.ts` — bridge/consume wiring (config, request-response)

**Analog:** `packages/core/src/create-auth-bridge.ts` (factory contract) + `transfer-store/kv.ts` (store factory).

**Integration contract** — `createAuthBridge(options)` returns exactly `{ bridge, consume }`, both `(request: Request) => Promise<Response>` (`create-auth-bridge.ts:38-46`). The `AuthBridgeOptions` shape (from `types.ts:38-84`):
- `store: TransferStore` — required. Use `createKVTransferStore()` (zero-arg → `Redis.fromEnv()`) on Vercel; in-memory fails by construction on serverless.
- `verifySession: () => Promise<unknown | null>` — required, the real gate. Supply `() => auth()`.
- `allowedOrigins: readonly string[]` — required. Must include BOTH the host-shell origin and the app origin (cross-site, D-09).
- `cookieName?`, `secure?` (default `true` → `__Secure-` name), `maxAge?` — optional.

**KV store factory** (`transfer-store/kv.ts:53-64`): import `createKVTransferStore` from the `next-auth-bridge/store/kv` subpath ONLY (never the main entry — `kv.ts:13-16`). Zero-arg call resolves `Redis.fromEnv()`, which reads `UPSTASH_REDIS_REST_URL` || `KV_REST_API_URL` and the matching token. No package code change needed; both env conventions already supported (`kv.ts:57-60`).

**Shape to write (re-comment on demo's own terms, no D-NN):**
```typescript
import { createAuthBridge } from "next-auth-bridge"
import { createKVTransferStore } from "next-auth-bridge/store/kv"
import { auth } from "../auth"

export const { bridge, consume } = createAuthBridge({
  store: createKVTransferStore(),
  verifySession: () => auth(),
  allowedOrigins: [process.env.HOST_SHELL_ORIGIN!, process.env.APP_ORIGIN!],
  secure: true,
})
```

---

### `examples/<app>/app/auth/bridge/route.ts` + `.../consume/route.ts` (route, request-response)

**Analog:** the handler signatures from `create-auth-bridge.ts` / `consume-route.ts`. No in-repo App Router route exists — this is the thin Web-standard wrapper.

Both handlers are plain `(request: Request) => Promise<Response>` with no Next.js coupling, so they mount directly. `runPopupFlow` fetches `/auth/bridge` with a plain GET (`popup-flow.ts:114`), so export GET (and POST is harmless to also map):
```typescript
// app/auth/bridge/route.ts
import { bridge } from "@/lib/auth-bridge"
export const GET = (req: Request) => bridge(req)
export const POST = (req: Request) => bridge(req)
```
```typescript
// app/auth/consume/route.ts
import { consume } from "@/lib/auth-bridge"
export const GET = (req: Request) => consume(req)
```
`consume` reads `code` + `next` from the **query string** (`consume-route.ts:114-116`) and returns 302 with one `Partitioned` Set-Cookie per chunk. The opaque `code` legitimately appears in the consume URL (the token never does).

---

### `examples/<app>/app/auth/popup/page.tsx` (component/React, event-driven) — D-13, the one new package-shaped artifact

**Analog:** `packages/core/src/popup-flow.ts` — `PopupFlowDeps` contract (`popup-flow.ts:51-73`).

`runPopupFlow(deps)` deps: `opener` (required, `OpenerLike` = `{ postMessage(data, targetOrigin) }`), `hostOrigin` (required, EXPLICIT origin — NEVER `"*"`, the receiver pin), optional `fetch` (defaults to global), optional `bridgePath` (defaults `/auth/bridge`). It fetches the bridge, posts `{ source:"next-auth-bridge", type:"auth-success", code }` on success or a structured `auth-error` on failure — never throws (`popup-flow.ts:104-134`).

```tsx
"use client"
import { useEffect } from "react"
import { runPopupFlow } from "next-auth-bridge"

export default function PopupPage() {
  useEffect(() => {
    if (!window.opener) return
    void runPopupFlow({
      opener: window.opener as unknown as { postMessage(d: unknown, t: string): void },
      hostOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN!, // exact origin, never "*"
    })
  }, [])
  return <p>Completing sign-in…</p>
}
```
This page is the intended home of the `popup-page.tsx` pointer; `packages/core` stays React-free.

---

### opener sign-in component + `examples/<app>/lib/consume-transport.ts` (D-10 seam)

**Analog:** `packages/core/src/open-auth-popup.ts` — `OpenAuthPopupDeps` (`open-auth-popup.ts:90-119`) + typed rejection `OpenAuthPopupError` with `reason: "auth-error"|"popup-blocked"|"popup-closed"|"timeout"` (`open-auth-popup.ts:38-56`).

`openAuthPopup(deps)` deps: `allowedOrigins` (required), optional `popupUrl` (default `/auth/popup`), `open`/`addMessageListener`/`setTimer` (default to globals), `popupTarget`/`popupFeatures`/`timeoutMs`/`closePollMs`. Resolves `{ code }` on a trusted `auth-success`; origin + source + namespace are all checked via `isTrustedMessage`.

The **D-10 swappable seam** (`lib/consume-transport.ts`) is a single closure-style function — fetch variant preferred by research (partition key = top-level site, transport-independent), navigation as fallback; do NOT hard-code before the live check:
```typescript
export async function redeemHandle(code: string, next = "/"): Promise<void> {
  const url = `/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`
  await fetch(url, { credentials: "include", redirect: "follow" }) // VARIANT A
  // VARIANT B fallback: window.location.assign(url)
}
```
Opener composition: `const { code } = await openAuthPopup({...}); await redeemHandle(code, location.pathname)`.

---

### `examples/<app>/middleware.ts` (middleware, Edge, request-response)

**Analog:** `packages/core/src/middleware.ts` — `createBridgeMiddleware` (`middleware.ts:77-101`).

Wire middleware from `createBridgeMiddleware` ONLY — NEVER from `createAuthBridge` (which pulls the store and breaks the Edge runtime). Options (`middleware.ts:49-62`): `popupEntryPath` (e.g. `/auth/popup`), `isAuthenticated: (req: RequestLike) => boolean` (cookie-presence is fine — UX routing, not a gate). The middleware returns a `RouteDecision | undefined` structural descriptor (`middleware.ts:46`); the app maps `{ action:"rewrite", destination }` → `NextResponse.rewrite(destination)` and `undefined` → `NextResponse.next()`. It reads `Sec-Fetch-Dest === "iframe"` to decide.

---

### `examples/<app>/app/t/[tenant]/manifest.webmanifest/route.ts` (route, request-response)

**Analog:** `consume-route.ts:144-151` — the raw `new Response(body, { headers })` + explicit-header idiom (the package never uses `NextResponse.json()`; it sets headers on a `Headers`/`Response` directly).

Per RESEARCH Pattern 5: `export const dynamic = "force-dynamic"`; return a raw `Response` with explicit `Content-Type: application/manifest+json` (NOT `NextResponse.json()` → that emits `application/json` and fails the media-type constraint). Per-tenant `name`/`short_name`/`start_url`/`scope`/`icons` from `await params`. Async `params` (Next 16: `params: Promise<{ tenant: string }>`).

---

### `examples/<app>/tests/manifest.test.ts` (test, request-response)

**Analog:** `packages/core/src/__tests__/consume-route.test.ts` — the negative-case Vitest style (`consume-route.test.ts:1-67`).

Project test conventions to mirror:
- `import { describe, expect, it } from "vitest"` (`consume-route.test.ts:31`).
- Each invariant gets an asserting case INCLUDING the negative (here: wrong media type, identical-manifest-across-tenants regression, cached vs per-request).
- Response cookies always read via `getSetCookie()` (array), never `.get("Set-Cookie")` — not relevant for manifest but the Header-reading discipline carries.
- Recording-wrapper pattern (`consume-route.test.ts:63-69`) for asserting a dependency was/was not reached without relying on its return — reuse for the keycloak helper.
- Header comment may carry THREAT-NN ONLY for internal package tests; the **example's** `tests/` ships in OSS → NO internal IDs (re-explain plainly).

---

### `examples/<app>/tests/keycloak-roundtrip.test.ts` + browserless PKCE helper (test + utility)

**Analog:** `packages/core/src/__tests__/roundtrip.e2e.test.ts` — drives the REAL `createAuthBridge`-derived `bridge` then `consume` end-to-end with plain Web-standard `Request` objects (`roundtrip.e2e.test.ts:38-51`), asserting `getSetCookie()` carries `Partitioned`, the handle is one-time (replay → 4xx, `[]`).

Test assertion shape: real Keycloak auth-code+PKCE session (browserless helper, RESEARCH Pattern 4 — NOT direct-access-grant/ROPC, which voids the real-PKCE claim) → `/auth/bridge` mints handle → `/auth/consume` → 302 + `Partitioned` Set-Cookie → replay → 4xx + no cookie. The browserless PKCE helper is a closure-style utility (no class): generate `code_verifier`/`code_challenge`, GET authorize endpoint, parse login-form action, POST credentials, follow redirect for `code`, POST `code + code_verifier` to `/token`.

## Shared Patterns

### Dependency-injection seam (closures-over-deps, no classes)
**Source:** every client helper — `popup-flow.ts:51-73`, `open-auth-popup.ts:90-119`, `middleware.ts:49-62`.
**Apply to:** all example-local helpers (consume-transport seam, PKCE helper, any test fakes).
Pattern: a `create…(options)`/`run…(deps)` function captures injected deps in a closure and returns a closure. Browser globals (`fetch`, `open`, timers) are parameters defaulting to `globalThis`; the example provides the REAL browser implementations. State lives in the closure, never on `this`.

### Origin allowlist (defense-in-depth, present-Origin-only)
**Source:** `consume-route.ts:105-112` (and identical in bridge-route).
**Apply to:** the `allowedOrigins` config in `lib/auth-bridge.ts` and `openAuthPopup`/`runPopupFlow` callsites.
A PRESENT `Origin` not in the allowlist → 4xx; an ABSENT `Origin` passes through to the real gate (top-level navigations carry no Origin). For Phase 5 the allowlist MUST be cross-site (host-shell origin ≠ app origin, D-09).

### postMessage trust (origin + source + namespace, never `"*"`)
**Source:** `popup-flow.ts:132-133` (explicit `hostOrigin` target), `open-auth-popup.ts:24` + `asBridgeMessage` (`open-auth-popup.ts:129-141`).
**Apply to:** the `/auth/popup` page (`hostOrigin` = exact app origin) and the opener component (`allowedOrigins`).
Never pass `"*"` as a postMessage target; the message shape is the namespaced `{ source:"next-auth-bridge", type, code }`.

### Subpath isolation for heavy deps
**Source:** `package.json:7-16` (`.` and `./store/kv` exports) + `kv.ts:13-16` (subpath-only import discipline).
**Apply to:** `lib/auth-bridge.ts` imports `createKVTransferStore` from `next-auth-bridge/store/kv`; `@upstash/redis` is the subpath's peer (declare it in the example's `package.json`). Never import the KV store into `middleware.ts` (Edge).

### Negative-case Vitest discipline
**Source:** `__tests__/consume-route.test.ts:1-29` (invariant→case mapping), `roundtrip.e2e.test.ts` (full-handoff drive), `getSetCookie()` array reads, recording-wrapper for reach-assertions.
**Apply to:** both example test files. Each behavior ships a positive AND a negative (replay→4xx, wrong media type). No real waits/timers — inject clocks.

## No Analog Found

Files the planner should build from RESEARCH.md patterns (no in-repo Next.js app or CI exists yet):

| File | Role | Data Flow | Reason / Reference |
|------|------|-----------|--------------------|
| `auth.ts` + `app/api/auth/[...nextauth]/route.ts` | config/route | request-response | First Auth.js v5 config in repo — RESEARCH Pattern 1 (`MicrosoftEntraID` `/common`, `tid` claim). Install `next-auth@beta` (v5), NOT `latest` (v4). |
| `app/t/[tenant]/page.tsx`, `app/install-pwa/page.tsx`, `<host-shell>/app/page.tsx` | component (React) | SSR/static | No in-repo React/App Router pages. Clean-minimal UI (D-08); host-shell on a SEPARATE `*.vercel.app` origin (D-09); install-pwa inert + labeled "Mode B preview — not wired" (D-07). |
| browserless PKCE login helper | utility | request-response | RESEARCH Pattern 4 — real auth-code+PKCE form-walking, not ROPC. |
| `.github/workflows/keycloak-agnosticism.yml` | config (CI) | — | No in-repo workflow. Dockerized Keycloak `26.x` `--import-realm` + explicit readiness poll (RESEARCH A5). NO internal req-IDs in committed YAML. |
| `keycloak/realm-export.json`, `.env.example`, `package.json`/`tsconfig` | config | — | Greenfield workspace package (first occupant of `examples/*`). `package.json` peer/exports idiom mirrors `packages/core/package.json`. |

## Metadata

**Analog search scope:** `packages/core/src/` (all 13 modules + `transfer-store/kv.ts`), `packages/core/src/__tests__/` (10 test files), `packages/core/package.json`, `pnpm-workspace.yaml`.
**Files scanned:** ~12 source + 4 test/config files read.
**Pattern extraction date:** 2026-06-09
