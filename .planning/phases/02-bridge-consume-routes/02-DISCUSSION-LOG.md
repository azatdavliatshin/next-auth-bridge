# Phase 2: Bridge & Consume Routes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 2-Bridge & Consume Routes
**Areas discussed:** TransferPayload + cookie, Session verification, Handler + responses, Config factory API

---

## Area selection

All four presented gray areas were selected for discussion (multiSelect): TransferPayload + cookie, Session verification, Handler + responses, Config factory API.

---

## TransferPayload shape

| Option | Description | Selected |
|--------|-------------|----------|
| All chunks, name+value pairs | Array of `{name,value}` cookie entries; bridge reads every session-token chunk, consume re-sets each. Correct for large/chunked JWTs. | ✓ |
| Single value, app supplies name | Keep `authCookieValue`; one canonical cookie name. Simpler but breaks for chunked/oversized JWTs. | |
| Single value now, chunk-ready type | Array type but single-cookie impl in v0.1, chunked as follow-up. | |

**User's choice:** All chunks, name+value pairs (Recommended)
**Notes:** Robustness against chunked/oversized enterprise JWTs wanted from day one. → CONTEXT D-01.

## Cookie attributes (consume)

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror captured + safe defaults | Re-apply source attrs, force Secure/HttpOnly/SameSite=None/Path=/ + partitioned. | ✓ |
| Fixed hardcoded attribute set | Always the same attrs, ignore source. Predictable but may diverge from app config. | |
| App-configurable via factory | `cookieOptions` override with hardened fallback. More surface, misconfig risk. | |

**User's choice:** Mirror captured + safe defaults (Recommended)
**Notes:** Clarified during write-up: incoming Cookie header carries only name=value (browsers don't echo attributes), so "mirror" = reconstruct attributes from config/hardened floors, not from the request. → CONTEXT D-02, D-03.

## Session verification (ROUTE-01 / THREAT-04)

| Option | Description | Selected |
|--------|-------------|----------|
| App injects an auth() verifier | Factory takes a `verifySession` callback from the app's Auth.js instance; bridge refuses on null. Version-agnostic. | ✓ |
| Bridge reads+validates cookie itself | Bridge decrypts/validates the JWT with a secret. Duplicates Auth.js internals; brittle. | |
| Both: verifier + value extractor | Verifier for the gate plus a callback to obtain the chunks. Most explicit, larger surface. | |

**User's choice:** App injects an auth() verifier (Recommended)
**Notes:** Bridge owns the refuse decision, app owns the mechanism. → CONTEXT D-04.

## Capturing cookie bytes (follow-up to verification)

| Option | Description | Selected |
|--------|-------------|----------|
| Read request cookies by known prefix | After verifier says yes, harvest every chunk matching the resolved Auth.js prefix from the incoming request. | ✓ |
| App-supplied cookie extractor callback | App returns the chunks. More boilerplate on every consumer. | |
| Verifier returns session + raw cookies | One seam returning `{session, cookieChunks}`. Couples identity proof with byte harvesting. | |

**User's choice:** Read request cookies by known prefix (Recommended)
**Notes:** Session already lives in the request that hit the bridge; harvest it. Locks `getAuthCookieName`'s role (resolve the prefix incl. `__Secure-` and `.0/.1`). → CONTEXT D-05.

## Handler shape

| Option | Description | Selected |
|--------|-------------|----------|
| Web-standard (Request)=>Response | Factory returns Fetch-API handlers; app re-exports from route.ts. Testable with plain Request on Vitest bench. | ✓ |
| Next.js route.ts exports directly | Ship NextRequest/NextResponse handlers. Couples tests to the Next runtime. | |
| Both via thin Next adapter | Core Web-standard + a Next wrapper. More surface than v0.1 needs. | |

**User's choice:** Web-standard (Request)=>Response (Recommended)
**Notes:** Directly serves the Phase 3 "first flow on the test bench" goal. → CONTEXT D-06.

## Bridge response

| Option | Description | Selected |
|--------|-------------|----------|
| JSON {code} on success, 401 on refusal | 200 `{ code }` (opaque handle, no token); 401 no-detail on no-session. Handle never in a URL. | ✓ |
| Redirect with code as query param | 302 with `?code=`. Fewer round-trips but puts handle in URL (history/referrer/logs). | |
| JSON on success, redirect on refusal | 200 JSON then redirect to sign-in on refusal. Mixed model. | |

**User's choice:** JSON {code} on success, 401 on refusal (Recommended)
**Notes:** Strongest hygiene vs THREAT-09/10; consistent with no-token-in-URL discipline. → CONTEXT D-07.

## Consume response

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to sanitized next, 4xx on bad inputs | 302 to sanitized `next` (default `/`) + cookie set; bad handle → 4xx no cookie; forged next degrades to `/`. | ✓ |
| Redirect on success, redirect-to-error on failure | Uniform redirects; turns a security rejection into navigation, harder to assert. | |
| JSON status, app does its own redirect | consume returns JSON + sets cookie, app redirects. Pushes redirect/sanitizeNext onto every app. | |

**User's choice:** Redirect to sanitized next, 4xx on bad inputs (Recommended)
**Notes:** Forged `next` degrades silently to `/`, but the negative test must still assert the unsafe target is never honored. → CONTEXT D-08, D-09.

## Config factory API (ROUTE-05)

| Option | Description | Selected |
|--------|-------------|----------|
| One factory → { bridge, consume } | `createAuthBridge(options)` returns named Web-standard handlers; single wiring point. | ✓ |
| Separate createBridge / createConsume | Two factories; app keeps shared config in sync (drift risk). | |
| Factory returns handlers + helpers bundle | Also returns getAuthCookieName/sanitizeNext. Widens v0.1 surface. | |

**User's choice:** One factory → { bridge, consume } handlers (Recommended)
**Notes:** Matches factory/no-class convention; helpers stay separately importable. → CONTEXT D-10, D-11.

## allowedOrigins role

| Option | Description | Selected |
|--------|-------------|----------|
| Server CORS/Origin allowlist for routes | Gates which origins may call bridge/consume server-side; complements Phase 3 client postMessage checks. | ✓ |
| Config-only, consumed in Phase 3 | Stored but not enforced server-side now. Unenforced-config gap risk. | |
| Both server-enforce and expose to client | Enforce server-side AND expose for client checks. Most defense-in-depth, more to build now. | |

**User's choice:** Server CORS/Origin allowlist for routes (Recommended)
**Notes:** → CONTEXT D-12.

## Mode scope (popup vs PWA)

| Option | Description | Selected |
|--------|-------------|----------|
| Popup-only, mode-agnostic seam | Only popup (partitioned CHIPS) in v0.1; no mode param; cookie-writer factored for v0.2 regular-cookie path. | ✓ |
| Mode param, PWA branch stubbed | Both branches, PWA inert. Adds an untested Mode B seam to a security-critical route early. | |
| Single cookie writer, attributes vary later | One writer taking attrs as input; no mode concept at all. Defers "how does route know mode" to v0.2. | |

**User's choice:** Popup-only, mode-agnostic seam (Recommended)
**Notes:** Matches Mode B → v0.2 and depth-over-breadth Core Value. → CONTEXT D-13.

---

## Claude's Discretion

- Exact required-vs-optional split and full type of the `createAuthBridge` options object.
- Cookie-parsing mechanism for harvesting request chunks (invariant locked: capture all chunks matching the resolved prefix).
- How `getAuthCookieName` derives the prefix and matches chunk suffixes.
- Exact 4xx codes for failure paths (behavior — reject, no cookie, no detail leak — is locked).
- Whether PKCE preservation (ROUTE-04) needs active code or holds by the bridge not touching Auth.js PKCE cookies (researcher to confirm).

## Deferred Ideas

- PWA-mode (regular, non-partitioned) cookie path in consume — v0.2 (Mode B).
- `mode` parameter / Mode B route branch — v0.2.
- Next.js / Pages-router adapter for the handlers — later/optional.
- `docs/architecture.md` authoring — referenced by CLAUDE.md, not yet created; noted as a doc gap (Phase 4 owns threat-model doc).
- Folding helpers into the factory return — rejected for v0.1; helpers stay separately importable.
- **Reviewed, not folded:** Phase 1 carried todo (tsup → tsdown migration) — explicitly Phase 6 scope, unrelated to routes.
