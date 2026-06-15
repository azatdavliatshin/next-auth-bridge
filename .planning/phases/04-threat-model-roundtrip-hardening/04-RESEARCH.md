# Phase 4: Threat Model & Roundtrip Hardening - Research

**Researched:** 2026-06-09
**Domain:** Security documentation (invariant-indexed threat model) + pure-Node integration test hardening (Vitest, DI-seam, no DOM)
**Confidence:** HIGH — this is an in-repo phase; every finding is verified against the actual shipped code and a fully green (96/96) test suite read this session.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (promote + harden in place):** Treat the existing pure-Node `packages/core/src/__tests__/roundtrip.e2e.test.ts` as the **canonical** roundtrip. Extend it to drive the **real `openAuthPopup` / `runPopupFlow` client helpers via their DI fakes** end-to-end — rather than a hand-shaped message object. **Stays dependency-free: no jsdom/happy-dom, no DOM test runtime.**
- **D-02 (fold key negatives into the roundtrip):** Fold the **two load-bearing trust-boundary negatives at roundtrip level**: (a) **replay** — second `consume` of the same code fails and sets no cookie; (b) **wrong-origin message rejection** — a `postMessage` from a disallowed origin/mismatched source is dropped and the flow does not resolve. Entropy / TTL / sanitizeNext / PKCE invariants **stay in their existing focused unit tests** and are **mapped** in the threat-model table rather than re-proven at roundtrip level.
- **D-03 (invariant-indexed table form):** `docs/threat-model.md` is a **table keyed by the canonical THREAT-NN invariants**. Each row maps **property → mitigation → the specific `test-file::test-name` that proves it**. Concise, traceable, CI-greppable. (Rejected full STRIDE narrative; rejected minimal bullet list.)
- **D-04 (every invariant row cites a real, passing test):** Every `test-file::test-name` reference MUST resolve to an actually-passing test. A row pointing at a non-existent or failing test is a HARDEN-01 defect.
- **D-05 (THREAT-NN is canonical):** `docs/threat-model.md` is the **single source of truth** for security invariants, using the **THREAT-NN** scheme. Namespace rule: `THREAT-NN` = threat-model invariants; requirement IDs use category prefixes (`HARDEN-` etc.).
- **D-06 (reconcile the test's `T-03-NN` comments):** `roundtrip.e2e.test.ts` currently annotates threats with a `T-03-NN` scheme. Reconcile these to the canonical **THREAT-NN** IDs so doc citations and in-test comments agree. (Comment/annotation reconciliation, NOT a behavior change.)
- **D-07 (no separate architecture.md):** Do **NOT** create `docs/architecture.md` this phase. The invariant registry lives **inside `docs/threat-model.md`**.
- **D-08 (update CLAUDE.md's pointer):** Update CLAUDE.md's `docs/architecture.md` reference so the invariant registry points at `docs/threat-model.md`. Keep the "any change touching the bridge/consume routes … requires a threat-model.md update" discipline intact.

### Claude's Discretion

- The exact column set and ordering of the threat-model table (beyond property → mitigation → test), the doc's prose intro, and the precise wording of the THREAT-NN ↔ test mapping — provided D-03/D-04 hold.
- How to factor the real-helper-driven roundtrip (D-01) — a shared DI-fake harness vs inline fakes — as long as it stays pure-Node and reuses the Phase 3 `helpers.ts` DI seam.

### Deferred Ideas (OUT OF SCOPE)

- **Full `docs/architecture.md`** (component map, data-flow diagrams, Mode B trust boundaries) — folded into threat-model.md instead (D-07). Could become its own docs task at/before Phase 6.
- **jsdom/happy-dom window-level roundtrip test** — rejected to keep the bench dependency-free (D-01). Revisit only on a suspected real DOM-level regression.
- **Real browser CHIPS partition-enforcement check** — remains the D-11 manual/browser verification; a future Playwright-style browser-runtime test is a separate, larger effort (likely alongside the Phase 5 example app).
- Mode B / PWA-shell auth flow (`'pwa-shell'` remains a v0.2 stub).
- The multi-tenant Entra reference app and the real `/auth/popup` React component (Phase 5 — EXAMPLE-*).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HARDEN-01 | `docs/threat-model.md` enumerates all Mode A security properties with a mapped test for each invariant | THREAT-NN inventory below maps all 10 canonical invariants → green `test-file::test-name`. The "THREAT-NN → Citable Test Map" table is the planner's drop-in row source. `docs/` directory does not yet exist — it is created this phase. |
| HARDEN-02 | End-to-end Vitest integration test simulates iframe → popup → bridge → consume → partitioned-cookie roundtrip on a single origin (THREAT-01) | `roundtrip.e2e.test.ts` already proves the happy-path roundtrip driving REAL handlers. D-01 hardens it to additionally drive REAL `openAuthPopup`/`runPopupFlow` via DI fakes. The DI-seam shapes are confirmed below. |
| HARDEN-03 | Integration test confirms no Auth.js session token appears in any URL across the full flow (closes THREAT-09 / THREAT-10 at roundtrip level) | The token-value sweep across `clientConstructedUrls` is already the shipped shape (`roundtrip.e2e.test.ts:150-169`), permitting the opaque `code` in `?code=` (D-15). Keep and make canonical. |
</phase_requirements>

## Summary

This is a documentation-and-test consolidation phase, not a feature phase. The security mechanics already exist and are fully proven: **96/96 tests pass across 12 files** (verified this session via `vitest run` in `packages/core`). Every Mode A invariant already has at least one green, focused test. Phase 4 does two things: (1) writes the canonical `docs/threat-model.md` invariant table (the `docs/` directory does not yet exist — it is created here), and (2) hardens the existing `roundtrip.e2e.test.ts` to drive the REAL `openAuthPopup`/`runPopupFlow` client helpers through their Phase 3 DI fakes, folding in the replay + wrong-origin negatives at roundtrip level.

**The single load-bearing research finding (D-14):** In the SHIPPED code, the `/auth/consume` handoff is a **server-side 302 redirect** (`consume-route.ts:150-151` returns `Response(null, { status: 302, headers })` with `Location` + the `Partitioned` `Set-Cookie`s). The browser sets the partitioned cookie because it follows that navigation. Critically, **there is no client helper in the package that navigates to `/auth/consume`** — `openAuthPopup` resolves `{ code }` and stops; the application code drives consume. The popup-side `runPopupFlow` only *fetches the bridge* (a `fetch`, `popup-flow.ts:114`) and posts the handle back; it never touches consume. So the CHIPS-correct conclusion is: **the opener must drive consume as a top-level navigation (302), not a `fetch`** — a `fetch()` to `/auth/consume` would receive the `Set-Cookie` in a response the browser does not commit to a navigated document, and in a partitioned context the cookie may not be written. The hardened roundtrip honors this by continuing to drive `api.consume(...)` directly with a plain `Request` and asserting the 302 + `Partitioned` `Set-Cookie` — it must NOT model consume as a `runPopupFlow`/`fetch` step. The real-helper hardening (D-01) applies to the **bridge fetch + postMessage handoff** half (popup→opener), where `runPopupFlow` and `openAuthPopup` actually live — NOT to the consume half.

**Primary recommendation:** Build a small shared DI-fake harness (or inline fakes) that wires `runPopupFlow` (popup side: fake `fetch` that calls the REAL `api.bridge` handler, fake recording `opener`) into `openAuthPopup` (opener side: fake `open`, fake `addMessageListener`/message bus, fake clock) so the bridge's `{ code }` travels popup→opener through both REAL helpers and the REAL `isTrustedMessage` predicate. Then the opener constructs the consume URL and drives the REAL `api.consume` handler as a 302 navigation, asserts the per-chunk `Partitioned` `Set-Cookie`, and sweeps every client-constructed URL for the session-token value (permitting the opaque `code`). Author `docs/threat-model.md` as a THREAT-NN-keyed table whose every row cites one of the verified-green tests below.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Threat-model document (HARDEN-01) | Docs / repo artifact | — | A markdown traceability artifact under `docs/`; binds to the test suite by `test::name` citation. No runtime tier. |
| Bridge handle mint | API / Backend (`bridge-route.ts`) | — | Session gate + harvest + mint is server-only; returns `200 { code }`, zero cookies. |
| Popup-side handoff (`runPopupFlow`) | Browser / Client (popup, top-level context) | — | Fetches the bridge, posts the opaque handle to the opener via `postMessage`. Never touches a cookie or consume. |
| Opener-side receipt (`openAuthPopup` + `isTrustedMessage`) | Browser / Client (opener, embedded iframe) | — | Opens popup, validates inbound message (origin allowlist + source identity), resolves `{ code }`. |
| Consume handle → set partitioned cookie | API / Backend (`consume-route.ts`) | Browser (must be a **navigation**, not a fetch — D-14) | Server returns 302 + `Partitioned` `Set-Cookie`; the browser commits the cookie only by following the navigation in the host's top-level/partitioned context. |
| Roundtrip integration proof (HARDEN-02/03) | Test harness (pure-Node Vitest) | — | Drives all real symbols above with DI fakes; no DOM runtime. |

## Standard Stack

No new packages. This phase adds zero dependencies — it is documentation + a test extension on the existing bench.

### Core (already present, verified)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | v4.1.8 (running) | Test runner for the pure-Node bench | Already the project's test runner; `vitest run` is the `test` script. |
| node:crypto | Node built-in | `randomBytes(32)` entropy site (`generate-code.ts:19`) | Single auditable CSPRNG site (256-bit). |

**Installation:** None. No `npm install` / `pnpm add` step in this phase.

**Test command (verified this session):**
```bash
# Run from packages/core — there is NO root package.json / pnpm-workspace.yaml yet.
cd packages/core && pnpm test          # => vitest run
```
Verified output: `Test Files 12 passed (12) · Tests 96 passed (96)`.

> ⚠️ **cwd note for the planner:** `pnpm test` from the repo ROOT fails with `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` — the workspace manifest does not exist yet (it lands in Phase 6 release engineering). All test commands in plans/citations must run from `packages/core`. The CLAUDE.md `pnpm test` quick-reference is aspirational for the finished package, not yet runnable at the root.

## Package Legitimacy Audit

Not applicable — this phase installs no external packages. All code uses already-present, already-audited dependencies (`vitest`, `node:crypto`). No registry, slopcheck, or postinstall verification required.

## Architecture Patterns

### System Architecture Diagram (the flow the roundtrip proves)

```
[ iframe / embedded app ]                         [ top-level popup window ]
        │                                                   │
        │ openAuthPopup(deps)                               │
        │  - open(popupUrl) ──────────────────────────────► popup loads /auth/popup
        │  - addMessageListener(cb)                          │
        │                                                    │ runPopupFlow(deps)
        │                                                    │  - fetch(/auth/bridge) ──► [ API: api.bridge ]
        │                                                    │        verifySession (REAL gate)
        │                                                    │        harvest session-token chunks
        │                                                    │        store.create(payload) ► { code }
        │                                                    │  ◄──────────────────────── 200 { code }
        │   postMessage({source,type:auth-success,code},     │  - opener.postMessage(msg, hostOrigin)
        │      hostOrigin)  ◄─────────────────────────────── │    (explicit origin, NEVER "*")
        │                                                    │
        │  isTrustedMessage(event,{allowedOrigins,           │
        │     expectedSource:popupWin})  ── true ──┐         │
        │                                          ▼         │
        │   resolve({ code })  ◄── (wrong-origin/source ⇒ ignored, never resolves)
        │                                                    │
        │  ── opener builds consume URL ?code=&next= ──────────────► [ API: api.consume ]
        │       (TOP-LEVEL NAVIGATION / 302 — D-14, NOT a fetch)        store.consume(code) (delete-first)
        │                                                              writeChunkCookies (Partitioned)
        │   ◄──────────────────── 302 Location:/next + per-chunk Partitioned Set-Cookie
        │       (browser commits the partitioned cookie by following the redirect)
        ▼
   URL HYGIENE SWEEP (HARDEN-03): no session-TOKEN value in bridge URL or consume URL;
   the opaque `code` IS permitted in ?code= (D-15).
```

### Recommended Project Structure (additions only)
```
docs/
└── threat-model.md          # NEW (HARDEN-01) — docs/ dir does not exist yet
packages/core/src/__tests__/
└── roundtrip.e2e.test.ts    # HARDENED in place (D-01) — real helpers via DI fakes
```

### Pattern 1: Pure-Node DI-seam roundtrip (the canonical bench pattern)
**What:** Drive the real helpers with injected browser globals; no `window`, no real timers, no DOM lib.
**When to use:** The entire hardened roundtrip (D-01).
**The exact DI shapes the real helpers expect (verified):**
```typescript
// runPopupFlow (popup side) — popup-flow.ts:51-73
runPopupFlow({
  fetch: async (input: string) => /* ResponseLike: { ok, json() } */,  // wrap api.bridge
  opener: { postMessage(data, targetOrigin) { /* record */ } },         // OpenerLike (helpers.ts makeFakeOpener)
  hostOrigin: ORIGIN,                                                    // explicit, never "*"
  // bridgePath?: defaults to "/auth/bridge"
});

// openAuthPopup (opener side) — open-auth-popup.ts:90-119
openAuthPopup({
  allowedOrigins: [ORIGIN],
  open: (url, target, features) => popupWin,        // makeFakeOpen — returns the popup ref
  addMessageListener: (cb) => unsubscribe,          // makeFakeMessageBus.addMessageListener
  setTimer: clock.setTimeout,                       // makeFakeClock — deterministic, no real timers
  timeoutMs, closePollMs,                           // tune so the flow settles without real waits
});
```
**Source:** `packages/core/src/open-auth-popup.ts`, `packages/core/src/popup-flow.ts`, `packages/core/src/__tests__/helpers.ts` (the six DI fakes: `makeFakeWindow`, `makeFakePopup`, `makeFakeOpen`, `makeFakeMessageBus`, `makeFakeOpener`, `makeFakeClock`).

### Pattern 2: Wiring the popup→opener channel through BOTH real helpers
**What:** The bridge's `{ code }` must travel: `runPopupFlow` (fetch real `api.bridge`, post via fake opener) → the recorded `postMessage` payload is dispatched into `openAuthPopup`'s fake message bus with `{ origin: ORIGIN, source: popupWin, data: <the posted message> }` → `openAuthPopup` resolves `{ code }`.
**Key identity invariant:** `openAuthPopup` pins `expectedSource = popupWin` (the value its injected `open()` returned). The message dispatched into the bus MUST carry `source: popupWin` (that same reference) or `isTrustedMessage` rejects it. This is the seam the wrong-source negative (D-02) exercises.
**The `source` field semantics:** `runPopupFlow`'s posted message data is `{ source: "next-auth-bridge", type, code }` — note `data.source` is the **namespace string** (the message-channel identity), whereas the MessageEvent-level `source` is the **window reference**. Do not conflate them when constructing the dispatched event.

### Pattern 3: Set-Cookie always read via `getSetCookie()` (array)
**What:** Never `headers.get("Set-Cookie")` — the Fetch API special-cases `Set-Cookie` and folds multiple headers. Per-chunk cookies require `getSetCookie()`.
**Source:** Already enforced in `roundtrip.e2e.test.ts:135` and `consume-route.test.ts:127`. Carry forward unchanged.

### Anti-Patterns to Avoid
- **Modeling consume as a `fetch` (D-14 violation):** A `fetch('/auth/consume')` would not commit the partitioned cookie to the host's top-level context — consume MUST be a navigation (302). The roundtrip drives `api.consume` directly with a plain `Request` and asserts the 302; it must NOT route consume through `runPopupFlow`/a fake `fetch`.
- **Adding jsdom/happy-dom (D-01 violation):** The package carries no DOM lib (`tsconfig lib: ["ES2022"]`). Keep all window-like values as the structural fakes in `helpers.ts`.
- **Asserting real CHIPS partition enforcement (D-11 honesty boundary):** The bench proves `Partitioned` attribute *emission* + data flow only — NOT browser partition isolation. The threat-model row for THREAT-06/partitioned-cookie MUST state this boundary explicitly.
- **Hand-shaping the postMessage object (D-01 supersedes):** The shipped test currently hand-builds `postedMessage` (`roundtrip.e2e.test.ts:102-106`). D-01 replaces this with the message *actually produced by* `runPopupFlow` and *consumed by* `openAuthPopup`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window/timer/message fakes for the roundtrip | New ad-hoc fakes | The six existing fakes in `__tests__/helpers.ts` | Already the Phase 3 DI seam; reusing them keeps one source of truth (Claude's Discretion in D-01 endorses this). |
| Trust check in the test | Re-implement origin+source comparison | The REAL `isTrustedMessage` (already imported in the e2e) | The whole point of D-01 is to exercise the real trust seam in flow. |
| Code-generation / entropy in the test | A fake code | The REAL `api.bridge` → `store.create` → `generateCode()` | The roundtrip drives real handlers; the 64-hex shape is asserted (`/^[0-9a-f]{64}$/`). |

**Key insight:** This phase is almost entirely *wiring existing real symbols together* + *documenting*. The temptation to re-prove invariants or build new fakes is exactly what D-02 and D-01's Discretion clause warn against.

## THREAT-NN Inventory → Citable Test Map (the HARDEN-01 row source)

> Verified: every test below is GREEN (read from a `vitest run` that reported 96/96 passing). Paths are relative to `packages/core/`. `test-name` = the exact `it(...)` string (the planner can cite as `file::"name"`).

| THREAT-NN | Property | Mitigation (code) | Citable test (`file :: it-name`) — VERIFIED GREEN |
|-----------|----------|-------------------|----------------------------------------------------|
| **THREAT-01** | Full roundtrip works end-to-end (iframe→popup→bridge→consume→partitioned cookie) on one origin | The composed `createAuthBridge` flow + client helpers | `src/__tests__/roundtrip.e2e.test.ts :: "drives the real bridge -> (simulated postMessage) -> consume to a 302 with per-chunk Partitioned Set-Cookie, and keeps the session token out of every client-constructed URL (D-15)"` *(this is the test being HARDENED this phase — the cite updates as it is extended)* |
| **THREAT-02 (entropy)** | Codes are 256-bit CSPRNG hex | `generate-code.ts:19` `randomBytes(32).toString("hex")` | `src/transfer-store/__tests__/generate-code.test.ts :: "generates 256-bit (64 lowercase-hex-char) codes"` and `:: "generates unique codes across 10,000 generations"` |
| **THREAT-02 (one-time-use)** | Second consume of a code fails (delete-on-read) | `in-memory.ts` delete-first; `kv.ts` atomic getdel | `src/transfer-store/__tests__/in-memory.test.ts :: "in-memory: delete-on-read — a second consume after success returns null"` |
| **THREAT-02 (TTL)** | Codes expire ≤ 60s; over-cap TTL throws at construction | `in-memory.ts:65-68` guard; lazy expiry via injected clock | `src/transfer-store/__tests__/in-memory.test.ts :: "in-memory: lazy expiry via the injected clock returns null past the TTL"` and `:: "in-memory: constructing with ttlSeconds > 60 throws (no silent clamp)"` |
| **THREAT-03** | postMessage origin + source both required (sender validation) | `is-trusted-message.ts:55-57` | `src/__tests__/is-trusted-message.test.ts :: "THREAT-03: returns false for a wrong-origin message even with a matching source"` and `:: "THREAT-03: returns false when origin is allowed but source identity differs (same-origin racer)"`; in-flow: `src/__tests__/open-auth-popup.test.ts :: "THREAT-03: ignores a wrong-origin message; a subsequent valid one still resolves"` and `:: "THREAT-03: ignores a wrong-source message (same-origin racer)"` |
| **THREAT-04** | Bridge verifies a real session FIRST; context signals never gate the mint | `bridge-route.ts:69-72` | `src/__tests__/bridge-route.test.ts :: "refuses with 401 and mints nothing when there is no session"` and `:: "still refuses 401 when a wrapper/context signal is present but no session"` |
| **THREAT-05** | PKCE non-interference: harvest excludes csrf/pkce/state/callback decoys; success sets zero cookies | `cookie-codec.ts` harvest filter; `bridge-route.ts` zero Set-Cookie | `src/__tests__/bridge-route.test.ts :: "harvests only session-token chunks, excluding csrf/pkce/state/callback-url decoys"` (asserts zero Set-Cookie at `:148`, AM-2) |
| **THREAT-06** | One-time opaque handle exchange; forged/expired/replayed → 4xx no cookie; partitioned cookie set on success | `consume-route.ts:131-134` store.consume null→reject(); `writeChunkCookies` | `src/__tests__/consume-route.test.ts :: "rejects a forged handle with 4xx and no Set-Cookie"`, `:: "rejects an already-consumed handle on replay with 4xx and no Set-Cookie"`, `:: "exchanges a valid handle for a 302 with one hardened partitioned Set-Cookie per chunk"` |
| **THREAT-07** | Client-side URL hygiene — no session token in any client-constructed URL (opaque `code` permitted, D-15) | `popup-flow.ts` posts handle via postMessage not URL; `open-auth-popup.ts` no token in popupUrl | `src/__tests__/popup-flow.test.ts :: "carries ONLY source/type/code in the data — no token, no extra fields"` and `:: "posts with the explicit hostOrigin as targetOrigin and NEVER '*'"`; roundtrip-level sweep in `roundtrip.e2e.test.ts` (the hardened test) |
| **THREAT-08** | `sanitizeNext` rejects `/auth*`, `/api/auth*`, absolute, protocol-relative, backslash targets → `/` | `auth-helpers.ts` sanitizeNext | `src/__tests__/auth-helpers.test.ts :: "rejects /auth and /auth/* targets → /"`, `:: "rejects an absolute URL → / (attacker host never honored)"`, `:: "rejects a protocol-relative //evil target → / (attacker host never honored)"`, `:: "rejects a backslash protocol-relative /\\evil target → / (CR-01 bypass)"` (plus 5 more in that describe) |
| **THREAT-09** | No session token / JWT-shaped string in the bridge response body; handle never in a URL | `bridge-route.ts:102-105` body is `{ code }` only | `src/__tests__/bridge-route.test.ts :: "returns 200 { code } with an opaque handle, no token in body, and zero cookies"` |
| **THREAT-10** | No-token-in-URL closed at ROUNDTRIP level (across the full flow) | The roundtrip URL-hygiene sweep | `src/__tests__/roundtrip.e2e.test.ts :: "...keeps the session token out of every client-constructed URL (D-15)"` *(the hardened test — same test as THREAT-01; HARDEN-03 closes THREAT-09/10 here)* |

**Invariants lacking a clean citable test:** **None.** Every canonical THREAT-NN has at least one currently-green test. THREAT-01 and THREAT-10 are both proven by the single roundtrip test (the one being hardened this phase) — the planner should ensure the hardened test's `it(...)` name remains stable or update both citing rows together. THREAT-07 spans both focused popup-flow unit tests AND the roundtrip sweep.

## T-03-NN → THREAT-NN Reconciliation (D-06)

The `T-03-NN` comment annotations live ONLY in `roundtrip.e2e.test.ts` (header comment block, lines 14–31). Verified mapping:

| Current `T-03-NN` comment | Location | Canonical THREAT-NN | Reconciled meaning |
|---------------------------|----------|---------------------|--------------------|
| `T-03-10` ("Information Disclosure — client-constructed URLs") | `roundtrip.e2e.test.ts:14` | **THREAT-07** (and THREAT-10 at roundtrip level) | Session-TOKEN value never in any client-constructed URL; opaque `code` permitted (D-15). |
| `T-03-11` ("Tampering — Set-Cookie attributes; every consume Set-Cookie carries Partitioned") | `roundtrip.e2e.test.ts:22` | **THREAT-06** (partitioned-cookie facet) | Partitioned attribute EMISSION + data flow — honesty boundary (D-11): NOT real CHIPS enforcement. |
| `T-03-12` ("Spoofing — wrong-partition; the OPENER drives consume") | `roundtrip.e2e.test.ts:28` | **THREAT-06** (consume-context facet) / supports THREAT-01 | The opener (host context), not the popup, drives consume — the re-set cookie originates in the opener/host context. |

**Reconciliation action for the planner:** rewrite these three comment tags to reference the canonical `THREAT-07` / `THREAT-06` IDs (and note THREAT-10 at roundtrip level for the URL sweep), so the in-test comments agree with the `docs/threat-model.md` `test::name` citations. This is comment-only (D-06) — no assertion changes. Note: the test ALSO already uses correct `THREAT-07` references inline (e.g. lines 47, 57, 150) — only the three `T-03-NN` tags in the header block need reconciling.

> Sibling scheme note (informational, NOT in scope for D-06): `bridge-route.test.ts` / `consume-route.test.ts` carry `T-02-NN` comments (e.g. `T-02-12` Origin allowlist, `T-02-15` empty-harvest). D-06 names ONLY the `T-03-NN` comments in the roundtrip test. The `T-02-NN` tags are out of scope unless the planner chooses to fold them in — but CONTEXT.md scopes D-06 to the roundtrip test specifically. Recommend leaving `T-02-NN` untouched to keep the phase tight.

## CLAUDE.md Pointer Update (D-08) — exact current lines

Two references to update, both in `./CLAUDE.md`:

1. **Line 125** (under "When extending the project"):
   ```
   - Read `docs/architecture.md` and `docs/threat-model.md` at session start.
   ```
   D-08 edit: since `docs/architecture.md` is intentionally NOT created (D-07), drop the `architecture.md` reference (or redirect it). Suggested: `- Read \`docs/threat-model.md\` at session start (the invariant registry).` — exact wording is the planner's call.

2. **Lines 71 and 73** ("Threat model discipline" section) already point only at `docs/threat-model.md` and the discipline rule — these are CORRECT as-is and D-08 says keep the discipline intact. **Do not weaken** line 71's rule ("Any change touching the bridge/consume routes … requires a corresponding update to threat-model.md").

The ONLY line that names `docs/architecture.md` is **line 125**. That is the precise D-08 edit. (`grep -n "docs/architecture" CLAUDE.md` returns exactly one hit: line 125.)

## Replay + Wrong-Origin Roundtrip Negatives (D-02) — confirmed real behavior

**(a) Replay — second consume of same code → 4xx, no cookie.** Verified mechanism: `consume-route.ts:131-134` — `store.consume(code)` is delete-first (`in-memory.ts` delete-on-read); the second call returns `null` → `reject()` → `Response(null, { status: 400 })` with NO `Set-Cookie`. Already proven in isolation at `consume-route.test.ts :: "rejects an already-consumed handle on replay with 4xx and no Set-Cookie"`. At roundtrip level the assertion is: after the successful consume (302 + cookies), a second `api.consume` with the SAME `code` returns 4xx and `getSetCookie().length === 0`.

**(b) Wrong-origin / mismatched-source message → dropped, flow does not resolve.** Verified mechanism: `open-auth-popup.ts:259-268` — the message listener calls the REAL `isTrustedMessage(event, { allowedOrigins, expectedSource: popupWin })`; a disallowed `event.origin` OR an `event.source !== popupWin` returns early (`return;`) and never settles the promise. Already proven in isolation at `open-auth-popup.test.ts :: "THREAT-03: ignores a wrong-origin message..."` / `:: "THREAT-03: ignores a wrong-source message (same-origin racer)"` (the test races the promise against a sentinel to assert non-resolution). At roundtrip level the negative dispatches a message with a bad origin (or a `source` that is not `popupWin`) into the bus and asserts `openAuthPopup` does NOT resolve (sentinel-race pattern), THEN a valid message still resolves — proving the impostor did not settle or poison the flow.

> Pattern to reuse for "does not resolve": `Promise.race([promise.then(() => "resolved"), Promise.resolve(sentinel)])` then `expect(winner).toBe(sentinel)` — verified in `open-auth-popup.test.ts:109-115`.

## Common Pitfalls

### Pitfall 1: Reading Set-Cookie with `.get()` instead of `getSetCookie()`
**What goes wrong:** Multiple per-chunk `Set-Cookie` headers get folded into one comma-joined string; assertions on per-chunk count/attributes break or pass spuriously.
**How to avoid:** Always `headers.getSetCookie()` (array). Already enforced in the existing tests — carry forward.
**Warning signs:** A cookie assertion that splits on `,` or expects a single Set-Cookie value.

### Pitfall 2: Modeling consume as a fetch (the D-14 trap)
**What goes wrong:** Treating consume symmetrically with the bridge fetch — routing it through `runPopupFlow`/a fake `fetch` — silently misrepresents the CHIPS handoff (a fetched response's `Set-Cookie` is not committed to the navigated top-level/partitioned document).
**How to avoid:** Drive consume as a direct `api.consume(makeRequest(consumeUrl, ...))` returning 302; the "browser follows the redirect and sets the partitioned cookie" is the modeled navigation. Document this as the honesty boundary.
**Warning signs:** A `fetch`-shaped consume step, or asserting cookies off a `runPopupFlow` for consume.

### Pitfall 3: `expectedSource` identity drift between the two real helpers
**What goes wrong:** `openAuthPopup` pins `expectedSource = the value its injected open() returned`. If the message dispatched into the bus carries a different `source` reference, `isTrustedMessage` rejects the legitimate message and the happy path hangs/times out.
**How to avoid:** Thread the SAME `popupWin` reference: the value returned by the fake `open` is both the pinned source AND the `source` field on the dispatched valid message. (`makeFakePopup()` is the single shared identity — see `helpers.ts:113`.)
**Warning signs:** A timeout rejection on what should be the happy path; a freshly-created `{}` used as `source` instead of the popup ref.

### Pitfall 4: Citing a test name that drifts after hardening (D-04 defect)
**What goes wrong:** The roundtrip `it(...)` name changes during hardening but `docs/threat-model.md` still cites the old string → a dead citation → HARDEN-01 defect.
**How to avoid:** Lock the hardened test's `it(...)` name FIRST, then write the THREAT-01/THREAT-10 rows against it. Re-run `vitest run` and grep the doc's cited names against the suite before marking HARDEN-01 done.

## Runtime State Inventory

This phase has **no runtime state to migrate** — it adds a markdown doc and extends a test. There are no databases, services, OS registrations, secrets, or build artifacts that embed a renamed string.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified: phase touches `docs/` (new) + one test file only; no datastore keys involved. | None |
| Live service config | None — verified: no external service config in scope. | None |
| OS-registered state | None — verified: no scheduled tasks/daemons. | None |
| Secrets/env vars | None — verified: no secret/env names referenced. | None |
| Build artifacts | None — verified: no package rename; `docs/threat-model.md` is new content, `roundtrip.e2e.test.ts` is source-only. | None |

> The `T-03-NN → THREAT-NN` reconciliation (D-06) is a comment edit inside one test file, NOT a rename of any stored/registered identifier. No runtime caches the `T-03-NN` strings.

## Code Examples

### Wrapping a real route handler as a `ResponseLike` fetch for `runPopupFlow`
```typescript
// runPopupFlow expects fetch: (input: string) => Promise<{ ok, json() }>.
// The shipped api.bridge is (request: Request) => Promise<Response>; Response
// satisfies ResponseLike structurally. Wrap so the popup "fetches" the REAL bridge.
// Source pattern derived from popup-flow.ts:36-39 (ResponseLike) + roundtrip.e2e.test.ts:81-88.
const fakeFetch = async (_input: string): Promise<Response> =>
  api.bridge(
    makeRequest(BRIDGE_URL, {
      headers: {
        Origin: ORIGIN,
        Cookie: TOKEN_CHUNKS.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    }),
  );
```

### Driving the two real helpers so the handle crosses popup→opener
```typescript
// Source: open-auth-popup.ts + popup-flow.ts + helpers.ts DI fakes.
const popupWin = makeFakePopup();              // the pinned source identity
const openRec = makeFakeOpen(popupWin);
const bus = makeFakeMessageBus();
const clock = makeFakeClock();
const opener = makeFakeOpener();               // records runPopupFlow's postMessage

// Opener side: start awaiting the trusted handle.
const handlePromise = openAuthPopup({
  allowedOrigins: [ORIGIN],
  open: openRec.open as any,
  addMessageListener: bus.addMessageListener as any,
  setTimer: clock.setTimeout,
  timeoutMs: 1000, closePollMs: 100,
});

// Popup side: REAL runPopupFlow fetches the REAL bridge, posts the handle.
await runPopupFlow({ fetch: fakeFetch, opener, hostOrigin: ORIGIN });

// Bridge the recorded postMessage into the opener's message bus, carrying the
// pinned popupWin as the MessageEvent source (so isTrustedMessage passes).
const posted = opener.calls[0];                // { data, targetOrigin: ORIGIN }
bus.dispatch({ origin: ORIGIN, source: popupWin, data: posted.data });

const { code } = await handlePromise;          // resolves through the REAL trust seam
```

## State of the Art

No external state-of-the-art shift applies — this is in-repo consolidation. The only "old vs new" is internal:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-shaped `postedMessage` object in the roundtrip (`roundtrip.e2e.test.ts:102-106`) | Message produced by REAL `runPopupFlow`, consumed by REAL `openAuthPopup` | This phase (D-01) | The integrated flow exercises the actual client trust-boundary code, not a synthetic message. |
| Threat invariants tracked only via tagged tests + scattered Phase-1/2 SECURITY docs | Single canonical `docs/threat-model.md` table (THREAT-NN → test) | This phase (D-03/D-05/D-07) | One source of truth; CLAUDE.md pointer redirected (D-08). |
| `T-03-NN` ad-hoc comment scheme in the roundtrip test | Canonical `THREAT-NN` IDs | This phase (D-06) | Doc citations and in-test comments agree. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | (none) | — | All claims in this research are VERIFIED against the shipped code and a green 96/96 suite read this session, or CITED from CONTEXT.md/REQUIREMENTS.md. No `[ASSUMED]` claims. |

**This table is empty:** Every finding was verified by reading the actual source/tests or by running the suite. No user confirmation needed before planning.

## Open Questions

1. **Stable `it(...)` name for the hardened roundtrip (D-04 hygiene).**
   - What we know: THREAT-01 and THREAT-10 both cite the single roundtrip test by its `it(...)` string. Hardening (D-01) extends that test and may add new `it` blocks (e.g. a separate `it` for the replay negative and the wrong-origin negative, per D-02).
   - What's unclear: whether the planner folds the negatives into the one `it` or splits them into sibling `it`s in the same `describe`.
   - Recommendation: Prefer sibling `it`s (one happy-path, one replay-negative, one wrong-origin-negative) so each threat-model row can cite a precise, narrowly-scoped test name. Lock those names before writing the doc rows. Either factoring satisfies D-01/D-02; this is Claude's Discretion.

2. **Should THREAT-02 be one row or three in the table?**
   - What we know: THREAT-02 covers entropy + one-time-use + TTL, each with its own green test (across `generate-code.test.ts` and `in-memory.test.ts`).
   - Recommendation: Three sub-rows (or one row citing all three tests). D-03 leaves column/row factoring to Discretion; three sub-rows keeps each citation 1:1 with a test, which best serves D-04.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| vitest | Running the suite + verifying citations | ✓ | v4.1.8 | — |
| Node `node:crypto` | Entropy site (already shipped) | ✓ | Node built-in | — |
| pnpm | `pnpm test` in `packages/core` | ✓ | (ran successfully) | npm/npx vitest |

**Missing dependencies:** None. **Caveat (not blocking):** `pnpm test` must run from `packages/core`, not the repo root (no root manifest yet — see Standard Stack note).

## Validation Architecture

> `workflow.nyquist_validation` not found as `false` in config — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4.1.8 |
| Config file | none detected at `packages/core` root — `vitest run` uses defaults (no `vitest.config.*` present; `test` script is bare `vitest run`) |
| Quick run command | `cd packages/core && pnpm test` (or `npx vitest run src/__tests__/roundtrip.e2e.test.ts`) |
| Full suite command | `cd packages/core && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HARDEN-01 | Every THREAT-NN row cites a green test; doc exists | doc + meta-check | `cd packages/core && pnpm test` then grep cited names against suite | ❌ `docs/threat-model.md` (Wave: this phase) |
| HARDEN-02 | Full roundtrip via REAL helpers, 302 + Partitioned cookie | integration | `npx vitest run src/__tests__/roundtrip.e2e.test.ts` | ✅ (hardened in place) |
| HARDEN-02 (D-02) | Replay → 4xx no cookie at roundtrip level | integration | same file | ✅ (added) |
| HARDEN-02 (D-02) | Wrong-origin/source message dropped, flow does not resolve | integration | same file | ✅ (added) |
| HARDEN-03 | No session-token value in any client-constructed URL; `code` permitted | integration | same file | ✅ (URL sweep present, kept) |

### Sampling Rate
- **Per task commit:** `cd packages/core && npx vitest run src/__tests__/roundtrip.e2e.test.ts`
- **Per wave merge:** `cd packages/core && pnpm test` (full 96+ suite)
- **Phase gate:** Full suite green AND every `docs/threat-model.md` cited `test::name` resolves to a passing test (D-04) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `docs/threat-model.md` — NEW file, `docs/` directory does not exist yet (HARDEN-01).
- No framework install needed — Vitest is present and green.
- No new test file — `roundtrip.e2e.test.ts` is extended in place (D-01).

*(Existing test infrastructure covers all phase requirements except the new doc artifact.)*

## Security Domain

> `security_enforcement` not set to `false` — section included. This phase IS the security-documentation phase, so the threat model below is the deliverable itself.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | App-injected `verifySession` gate (`bridge-route.ts:69`); context signals never gate the mint (THREAT-04). No credential handling in-package. |
| V3 Session Management | yes | Opaque one-time 256-bit handle (`generateCode`); session token rides only in the consume `Set-Cookie`, never a URL or response body (THREAT-07/09/10). |
| V4 Access Control | yes | `allowedOrigins` allowlist on both routes (defense-in-depth); `isTrustedMessage` origin+source pin (THREAT-03); `sanitizeNext` open-redirect control (THREAT-08). |
| V5 Input Validation | yes | `sanitizeNext` (THREAT-08); AM-1 absent/empty `?code=` guard before the store (`consume-route.ts:122`). |
| V6 Cryptography | yes | Single CSPRNG entropy site `randomBytes(32)` (`generate-code.ts:19`) — never hand-rolled (THREAT-02). |

### Known Threat Patterns for Mode A (the threat-model.md content seed)

| Pattern | STRIDE | Standard Mitigation (verified in code) |
|---------|--------|----------------------------------------|
| Guessable/forged transfer handle | Spoofing | 256-bit CSPRNG one-time handle, delete-first consume (THREAT-02/06) |
| Forged "I'm in a wrapper" signal to mint without auth | Spoofing/Elevation | `verifySession` runs first, independent of context (THREAT-04) |
| Handle replay | Tampering | Atomic delete-first; second consume → null → 4xx no cookie (THREAT-06) |
| Cross-window message forgery (same-origin racer / wrong origin) | Spoofing | `isTrustedMessage`: origin allowlist AND `source` identity, both required (THREAT-03) |
| Session token in URL/logs | Information Disclosure | Handle-only `200 { code }` body; URL sweep at roundtrip (THREAT-07/09/10) |
| Open redirect via `next` | Tampering | `sanitizeNext` → `/` on unsafe targets (THREAT-08) |
| PKCE/state cookie disturbance | Tampering | Bridge harvests only session-token chunks; sets zero cookies (THREAT-05) |
| Cookie not partition-isolated across contexts | Tampering | `Partitioned; Secure; HttpOnly; SameSite=None; Path=/` emitted (THREAT-06). **Honesty boundary (D-11): emission proven, real CHIPS enforcement is a manual/browser check.** |

## Sources

### Primary (HIGH confidence)
- `packages/core/src/{bridge-route,consume-route,open-auth-popup,popup-flow,is-trusted-message,index,create-auth-bridge}.ts` — the real symbols and their exact line behavior.
- `packages/core/src/__tests__/{roundtrip.e2e,helpers,open-auth-popup,popup-flow,is-trusted-message,bridge-route,consume-route,auth-helpers}.test.ts` and `transfer-store/__tests__/{generate-code,in-memory}.test.ts` — verified test names and green status.
- `vitest run` output this session: **12 files / 96 tests passed**.
- `.planning/phases/04-threat-model-roundtrip-hardening/04-CONTEXT.md` — locked decisions D-01..D-08.
- `.planning/REQUIREMENTS.md` — HARDEN-01/02/03 + THREAT-NN namespace note.
- `.planning/phases/02-bridge-consume-routes/02-SECURITY.md` — canonical THREAT-04/05/06/08/09 ↔ code/test mapping (cross-checked against the live tests).
- `./CLAUDE.md` — exact pointer line 125 (`docs/architecture.md`) for D-08; threat-model discipline lines 71/73.

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md:107` — THREAT-09/10 roundtrip-closure framing.

### Tertiary (LOW confidence)
- None — no unverified web findings used; this is an in-repo phase.

## Project Constraints (from CLAUDE.md)

- **Functional style, no classes** — the roundtrip harness must be factory functions/closures (the existing `helpers.ts` fakes already comply; `OpenAuthPopupError extends Error` is the one permitted class and is pre-existing, not added this phase).
- **Vitest, with explicit security/negative cases** — D-02's replay + wrong-origin negatives satisfy this for the roundtrip.
- **No `any` outside test scaffolding** — DI-fake casts to `unknown`/`as any` are permitted in `__tests__/` per CLAUDE.md (the existing tests already do this).
- **No emoji in code or commit messages** — applies to `docs/threat-model.md` body and commits (emoji OK only in README headings; threat-model.md is not the README).
- **Conventional Commits** — likely `docs(04): ...` for threat-model.md, `test(04): ...` for the roundtrip hardening, `docs(04): update CLAUDE.md pointer`. Atomic, one logical change per commit.
- **Threat-model discipline** — this phase CREATES `docs/threat-model.md`; the discipline rule (line 71) that future bridge/consume/store/cookie/wrapper changes must update it stays intact (D-08).
- **MIT license, no per-file headers** — do not add SPDX/copyright headers to the new doc or the test.
- **Commit trailer:** user global instruction — do NOT add a `Co-Authored-By` trailer to commit messages.

## Metadata

**Confidence breakdown:**
- THREAT-NN → test map: HIGH — every cited test read and confirmed green via `vitest run`.
- D-14 CHIPS fetch-vs-navigate conclusion: HIGH — derived directly from `consume-route.ts` (302 handler) + the absence of any client consume-navigation helper.
- DI-seam shapes for real-helper hardening: HIGH — read from `open-auth-popup.ts`/`popup-flow.ts`/`helpers.ts` signatures.
- D-06 / D-08 exact-line findings: HIGH — grep-confirmed exact locations.

**Research date:** 2026-06-09
**Valid until:** 30 days (stable in-repo target; only invalidated if the test suite or these source files change before planning).
