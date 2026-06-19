# Threat model — next-auth-bridge (Mode A, popup-bridge)

This document is the canonical, self-contained registry of the security invariants of the
**Mode A** (popup-bridge) cross-context authentication flow. Scope: a Next.js / Auth.js app embedded
as an iframe inside an enterprise host (SharePoint, Teams Tab, Salesforce Lightning, ServiceNow,
Confluence/Jira) that already carries an active identity-provider session. A popup runs in the
top-level browser context, silent-auths against the host's existing IdP session, and hands the
resulting session back to the embedded app.

The whole flow reduces to **one architectural shape**: a server-side handle store mediates a
**one-time-code exchange across a trust boundary**. The popup mints an opaque 256-bit handle at
`/auth/bridge`, posts it (never the session token) to the opener via `postMessage`, and the opener
redeems it at `/auth/consume`, which sets the partitioned session cookie. No session token ever
travels in a URL, a response body, or a `postMessage` payload — only the opaque handle does.

`THREAT-NN` is the canonical invariant namespace, and **this file is the single source of truth**
for those invariants. (The `THREAT-NN` requirements originate in the maintainer's `.planning/`
tracking; their authoritative, shipped definition is the table below.) Every
row maps a security property to its mitigation (code evidence, `file:line`) and to a specific,
currently-green test (`test-file :: it-name`).
A row that cites a non-existent or failing test is a defect — citations are kept honest against the
live `packages/core` suite.

**Mode B** (the PWABuilder iOS / `ASWebAuthenticationSession` wrapper transport) shares the same
server-side handle-store shape but is **out of scope for the v0.1 test suite**. It informs the
threat scope (the same one-time-code exchange crosses a native↔web trust boundary) but is not
enumerated here; its invariants will be added when Mode B gains deterministic test coverage.

## Trust boundaries

| Boundary | Description | Invariants |
|----------|-------------|------------|
| popup → opener (`postMessage`) | The handle crosses window contexts; the receiver must validate the sender. | THREAT-03 |
| client → `/auth/bridge` | The bridge must mint a handle only for a genuinely authenticated session, never on a forged context signal. | THREAT-04, THREAT-05, THREAT-09 |
| client → `/auth/consume` | The handle is a one-time bearer; replay/forgery must fail closed; success sets the partitioned cookie. | THREAT-06 |
| every client-constructed URL | The session token must never appear in any URL (only the opaque handle may). | THREAT-07, THREAT-09, THREAT-10 |

## Invariant registry

Code paths are relative to `packages/core/src/`. Test citations are `test-file :: it-name`, where the
test file lives under `packages/core/src/` (e.g. `__tests__/` or `transfer-store/__tests__/`) and the
`it-name` is the exact, currently-green test string.

| THREAT-NN | Property | Mitigation (code evidence) | Test (`test-file :: it-name`) |
|-----------|----------|----------------------------|-------------------------------|
| **THREAT-01** | The full roundtrip works end-to-end on one origin: iframe → popup → bridge mint → `postMessage` → opener consume → partitioned cookie, with the session token never in a client-constructed URL. | The composed `createAuthBridge` flow driven through the real `runPopupFlow` (popup side) + `openAuthPopup` (opener side), crossing the real `isTrustedMessage` trust seam. | `roundtrip.e2e.test.ts :: "drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)"` |
| **THREAT-02 (entropy)** | Codes are 256-bit CSPRNG lowercase-hex (64 chars), unguessable and unique. | `generate-code.ts:19` — `randomBytes(32).toString("hex")` (single CSPRNG entropy site, never hand-rolled). | `generate-code.test.ts :: "generates 256-bit (64 lowercase-hex-char) codes"` and `generate-code.test.ts :: "generates unique codes across 10,000 generations"` |
| **THREAT-02 (one-time-use)** | A handle is consumed at most once; the second consume of the same code fails (delete-on-read). | `in-memory.ts` delete-first read; `kv.ts` atomic `getdel`. | `in-memory.test.ts :: "in-memory: delete-on-read — a second consume after success returns null"` |
| **THREAT-02 (TTL)** | Codes expire within the TTL (≤ 60 s); an over-cap TTL throws at construction (no silent clamp). | `in-memory.ts:65-68` construction guard; lazy expiry via the injected clock. | `in-memory.test.ts :: "in-memory: lazy expiry via the injected clock returns null past the TTL"` and `in-memory.test.ts :: "in-memory: constructing with ttlSeconds > 60 throws (no silent clamp)"` |
| **THREAT-03** | `postMessage` sender validation requires BOTH an allowed origin AND the pinned `source` identity; a wrong-origin or wrong-source (same-origin racer) message is dropped and never settles the flow. | `is-trusted-message.ts:55-57` origin allowlist + `source` identity check; `open-auth-popup.ts` listener returns early on an untrusted event. | `is-trusted-message.test.ts :: "THREAT-03: returns false for a wrong-origin message even with a matching source"` and `is-trusted-message.test.ts :: "THREAT-03: returns false when origin is allowed but source identity differs (same-origin racer)"`; in-flow: `open-auth-popup.test.ts :: "THREAT-03: ignores a wrong-origin message; a subsequent valid one still resolves"` and `open-auth-popup.test.ts :: "THREAT-03: ignores a wrong-source message (same-origin racer)"`; roundtrip-level: `roundtrip.e2e.test.ts :: "wrong-origin/mismatched-source message is dropped; openAuthPopup does not resolve, then a valid message still resolves"` |
| **THREAT-04** | The bridge verifies a real session FIRST; a wrapper/context signal alone never gates the mint. | `bridge-route.ts:69-72` — `verifySession` runs before any context check; no session → 401, mints nothing. | `bridge-route.test.ts :: "refuses with 401 and mints nothing when there is no session"` and `bridge-route.test.ts :: "still refuses 401 when a wrapper/context signal is present but no session"` |
| **THREAT-05** | PKCE non-interference: the bridge harvests only session-token chunks, excluding csrf/pkce/state/callback-url decoys, and sets zero cookies on success. The single-un-suffixed-base case (an opaque non-Auth.js session cookie) now has direct function-boundary coverage. | `cookie-codec.ts` harvest filter; `bridge-route.ts` emits zero `Set-Cookie`. | `bridge-route.test.ts :: "harvests only session-token chunks, excluding csrf/pkce/state/callback-url decoys"`; opaque single-cookie isolation: `cookie-codec.test.ts :: "harvests exactly one opaque Better Auth session cookie, excluding .sig/_x near-misses and real BA sibling cookies"` |
| **THREAT-06** | One-time opaque-handle exchange: a forged, expired, or replayed handle → 4xx with no `Set-Cookie`; a valid handle → 302 with one partitioned `Set-Cookie` per chunk. | `consume-route.ts:131-134` — `store.consume(code)` is delete-first; `null` → `reject()` (4xx, no cookie); `writeChunkCookies` emits `Partitioned; Secure; HttpOnly; SameSite=None; Path=/` per chunk on success. | `consume-route.test.ts :: "rejects a forged handle with 4xx and no Set-Cookie"`, `consume-route.test.ts :: "rejects an already-consumed handle on replay with 4xx and no Set-Cookie"`, `consume-route.test.ts :: "exchanges a valid handle for a 302 with one hardened partitioned Set-Cookie per chunk"`; roundtrip-level replay: `roundtrip.e2e.test.ts :: "replay: a second consume of the same code returns 4xx and sets no cookie"` |
| **THREAT-07** | Client-side URL hygiene: no session token appears in any client-constructed URL (the opaque `code` is permitted in `?code=`, D-15). | `popup-flow.ts` posts the handle via `postMessage`, never a URL; `open-auth-popup.ts` builds `popupUrl` with no token. | `popup-flow.test.ts :: "carries ONLY source/type/code in the data — no token, no extra fields"` and `popup-flow.test.ts :: "posts with the explicit hostOrigin as targetOrigin and NEVER '*'"`; roundtrip-level sweep: `roundtrip.e2e.test.ts :: "drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)"` |
| **THREAT-08** | `sanitizeNext` rejects unsafe redirect targets (`/auth*`, `/api/auth*`, absolute URLs, protocol-relative `//`, backslash `/\`) and falls back to `/`. | `auth-helpers.ts` `sanitizeNext`. | `auth-helpers.test.ts :: "rejects /auth and /auth/* targets → /"`, `auth-helpers.test.ts :: "rejects an absolute URL → / (attacker host never honored)"`, `auth-helpers.test.ts :: "rejects a protocol-relative //evil target → / (attacker host never honored)"`, `auth-helpers.test.ts :: "rejects a backslash protocol-relative /\\evil target → / (CR-01 bypass)"` |
| **THREAT-09** | No session token / JWT-shaped string in the bridge response body; the handle is never placed in a URL. | `bridge-route.ts:102-105` — the body is `{ code }` only (opaque handle), zero cookies. | `bridge-route.test.ts :: "returns 200 { code } with an opaque handle, no token in body, and zero cookies"` |
| **THREAT-10** | No-token-in-URL holds at the ROUNDTRIP level — across the full composed flow, not just per-component. | The roundtrip URL-hygiene sweep over every client-constructed URL (same hardened test as THREAT-01). | `roundtrip.e2e.test.ts :: "drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)"` |

> **THREAT-01 / THREAT-10 dual-cite:** both rows intentionally cite the **same** hardened roundtrip
> `it(...)` name. THREAT-01 asserts the end-to-end flow succeeds; THREAT-10 asserts the URL-hygiene
> invariant holds across that same flow. They are kept locked to one test so the citation cannot drift.

## Honesty boundary — THREAT-06 partitioned cookie (D-11)

The THREAT-06 partitioned-cookie evidence proves the `Partitioned` attribute **EMISSION** and the
end-to-end **data flow** only: the consume response carries one `Set-Cookie` per chunk with
`Partitioned; Secure; HttpOnly; SameSite=None; Path=/`, and the roundtrip drives a real handle through
to that 302. It does **NOT** prove real CHIPS **partition enforcement** at the Node bench level —
that a browser actually isolates the cookie to the embedding partition is a property of the browser's
CHIPS implementation and can only be confirmed by a manual / real-browser check. That check **was
performed and recorded on 2026-06-12**: a two-origin live deploy confirmed the partitioned cookie is
keyed to the host-shell top-level site and is invisible under a different top-level partition (the
positive and negative isolation cases). See
[examples/tenant-app/docs/live-validation.md](../examples/tenant-app/docs/live-validation.md) §4
(CHIPS partition-isolation check). The Node-level bench still asserts only emission and data flow,
not isolation — the live check is what closes that gap.

Relatedly, the consume bench drives `api.consume(makeRequest(...))` **directly** (transport-agnostic),
not routed through a fake `fetch`. Whether a real client should redeem the handle via a **navigation**
or a **fetch** was an open empirical CHIPS question (a fetched response's `Set-Cookie` might not commit
to the navigated top-level/partitioned document the way a navigation's does). It is now **verified in
Phase 5: fetch is the resolved default** — the live two-origin run confirmed a credentialed fetch from
inside the embedded frame commits the partitioned cookie under the correct top-level partition. See
[examples/tenant-app/docs/live-validation.md](../examples/tenant-app/docs/live-validation.md) §5
(consume-transport observation). Phase 3's "prefer fetch" guidance therefore stands as the confirmed
default. This document does **not** assert that "consume must be a navigation" or that "a fetch is a
violation"; the live evidence resolves the transport choice in favor of fetch without changing any
THREAT-NN invariant.
