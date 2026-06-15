# Phase 4: Threat Model & Roundtrip Hardening - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 3 (1 new doc, 2 modified)
**Analogs found:** 3 / 3

This is a documentation-and-test consolidation phase. No feature/runtime files are added. Every target
file has a strong in-repo analog. The planner should hand executors the concrete excerpts below rather
than abstract pattern names. The full THREAT-NN -> citable-test row source already lives in
`04-RESEARCH.md` ("THREAT-NN Inventory -> Citable Test Map", lines 180-199) -- that table is the drop-in
content for `docs/threat-model.md` rows; this document supplies the *form* and the *test-mechanics* analogs.

## File Classification

| Target File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------|---------|------|-----------|----------------|---------------|
| `docs/threat-model.md` | NEW | doc (security traceability artifact) | transform (invariant -> mitigation -> test citation) | `.planning/phases/02-bridge-consume-routes/02-SECURITY.md` | role-match (same THREAT-NN table form; different home) |
| `packages/core/src/__tests__/roundtrip.e2e.test.ts` | MODIFIED | test (integration / e2e) | request-response + event-driven (postMessage handoff) | itself (promoted in place) + `open-auth-popup.test.ts` (DI-fake + sentinel-race seam) | exact |
| `CLAUDE.md` | MODIFIED | config (project instructions) | n/a (pointer edit) | self (line 125 single-line edit) | exact |

## Pattern Assignments

### `docs/threat-model.md` (doc, transform) -- NEW

**Analog:** `.planning/phases/02-bridge-consume-routes/02-SECURITY.md` (the established THREAT-NN
table form in this repo: a markdown table keyed by threat ID, each row mapping property -> mitigation
(code evidence with `file:line`) -> the asserting test). `docs/` does not exist yet -- create it.

**Note on scope difference:** 02-SECURITY.md is a *phase audit* (columns: Threat ID, Category,
Disposition, Status, Code Evidence, Test Evidence) with a frontmatter block and an Accepted Risks log.
`docs/threat-model.md` is the *canonical, self-contained registry* (D-03/D-05/D-07). Reuse 02-SECURITY.md's
**row shape and `file:line` + `test::name` citation discipline**, but drop the phase-audit framing
(frontmatter `phase/status/threats_closed`, the per-threat CLOSED/OPEN audit column). D-03 leaves exact
columns to discretion provided each row carries property -> mitigation -> `test-file::test-name`.

**Table-row shape to copy** (from `02-SECURITY.md:27-43` -- the header + a representative row):
```markdown
| Threat ID | Category | Disposition | Status | Code Evidence | Test Evidence |
|-----------|----------|-------------|--------|---------------|---------------|
| THREAT-06 | Tampering/Spoofing | mitigate | CLOSED | `consume-route.ts:131-134` -- `store.consume(code)`; `null`->`reject()` (`400`, no Set-Cookie). | `consume-route.test.ts:143-176` -- forged->`4xx`+`getSetCookie()===[]`; replay second->`4xx`+`[]`. |
```

**Row content source (drop-in):** `04-RESEARCH.md:184-198` -- the verified-green THREAT-NN -> `file :: it-name`
map. Every cited `it(...)` name there was confirmed against a green 96/96 suite. Per D-04, each row's
`test-file::test-name` MUST resolve to a passing test -- re-run `cd packages/core && pnpm test` and grep
the doc's cited names against the suite before marking HARDEN-01 done.

**Honesty-boundary row (THREAT-06 partitioned-cookie facet):** must state explicitly that the bench
proves `Partitioned` attribute EMISSION + data flow only, NOT real CHIPS partition enforcement (D-11).
Pattern source: the comment block at `roundtrip.e2e.test.ts:22-26` and `143-148`.

**THREAT-01 / THREAT-10 dual-cite caveat:** both rows cite the SAME (hardened) roundtrip `it(...)` name.
Lock that name first (see Pitfall 4, `04-RESEARCH.md:254-256`), then write both rows against it.

---

### `packages/core/src/__tests__/roundtrip.e2e.test.ts` (test, integration) -- MODIFIED IN PLACE

**Analog:** itself (D-01 promotes, does not rewrite) + `open-auth-popup.test.ts` for the DI-fake wiring
and sentinel-race non-resolution patterns. The DI fakes come from `helpers.ts` (the six-fake seam).

This file is hardened in three ways, all with existing in-repo precedent:

#### (1) Replace the hand-shaped postMessage with BOTH real helpers driven via DI fakes (D-01)

**Currently** (the thing being replaced, `roundtrip.e2e.test.ts:101-119`): a hand-built `postedMessage`
object passed straight to `isTrustedMessage`. D-01 supersedes this -- the message must be *produced by*
the real `runPopupFlow` and *consumed by* the real `openAuthPopup`.

**DI-fake wiring to copy** (from `04-RESEARCH.md:292-318`, which mirrors `open-auth-popup.test.ts:43-68`):
```typescript
const popupWin = makeFakePopup();              // the pinned source identity (helpers.ts:113)
const openRec = makeFakeOpen(popupWin);        // helpers.ts:145
const bus = makeFakeMessageBus();              // helpers.ts:170
const clock = makeFakeClock();                 // helpers.ts:231
const opener = makeFakeOpener();               // helpers.ts:207 -- records runPopupFlow's postMessage

// Opener side: start awaiting the trusted handle.
const handlePromise = openAuthPopup({
  allowedOrigins: [ORIGIN],
  open: openRec.open as OpenAuthPopupDeps["open"],
  addMessageListener: bus.addMessageListener as OpenAuthPopupDeps["addMessageListener"],
  setTimer: clock.setTimeout,
  timeoutMs: 1000, closePollMs: 100,
});

// Popup side: REAL runPopupFlow fetches the REAL bridge, posts the handle.
await runPopupFlow({ fetch: fakeFetch, opener, hostOrigin: ORIGIN });

// Bridge the recorded postMessage into the opener's bus, carrying popupWin as source.
const posted = opener.calls[0];                // { data, targetOrigin: ORIGIN }
bus.dispatch({ origin: ORIGIN, source: popupWin, data: posted.data });

const { code } = await handlePromise;          // resolves through the REAL trust seam
```

**`fakeFetch` wrapping the REAL bridge handler** (from `04-RESEARCH.md:280-289`; the bridge call shape
is already in `roundtrip.e2e.test.ts:81-88`). `runPopupFlow` expects `fetch: (input: string) => Promise<{ ok, json() }>`;
the shipped `Response` satisfies that structurally:
```typescript
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

**CRITICAL identity invariant (Pitfall 3, `04-RESEARCH.md:249-252`):** `openAuthPopup` pins
`expectedSource = the value its injected open() returned` (see `open-auth-popup.ts:228` + `:264`).
The message dispatched into the bus MUST carry that SAME `popupWin` reference as `source`, or
`isTrustedMessage` (`open-auth-popup.ts:262-268`) rejects the legitimate message and the happy path
hangs. Do NOT conflate `data.source` (the namespace STRING `"next-auth-bridge"`) with the
MessageEvent-level `source` (the window REFERENCE) -- see `04-RESEARCH.md:158`.

#### (2) Fold in the two roundtrip negatives (D-02)

**(a) Replay negative** -- after the successful consume (302 + cookies), a second `api.consume` with the
SAME `code` returns 4xx and sets no cookie. Pattern source: `consume-route.test.ts:143-176` (the isolated
replay test) and `04-RESEARCH.md:231`. Assertion shape:
```typescript
const replayRes = await api.consume(makeRequest(consumeUrl, { headers: { Origin: ORIGIN } }));
expect(replayRes.status).toBeGreaterThanOrEqual(400);
expect(replayRes.headers.getSetCookie().length).toBe(0);
```

**(b) Wrong-origin / wrong-source negative (non-resolution)** -- dispatch a message with a bad origin OR
a `source !== popupWin` into the bus and assert `openAuthPopup` does NOT resolve, then a valid message
still resolves. **Sentinel-race pattern to copy verbatim** (from `open-auth-popup.test.ts:101-116`,
also cited at `04-RESEARCH.md:235`):
```typescript
const sentinel = Symbol("pending");
const winner = await Promise.race([
  promise.then(() => "resolved"),
  Promise.resolve(sentinel),
]);
expect(winner).toBe(sentinel);   // the impostor did not settle the flow
```

#### (3) Keep the THREAT-07 / D-15 URL-hygiene sweep unchanged

The session-token-value sweep across `clientConstructedUrls` (currently `roundtrip.e2e.test.ts:150-169`)
is already the canonical HARDEN-03 proof. Keep it. It forbids the TOKEN values
(`TOKEN_VALUES`, `roundtrip.e2e.test.ts:57-58`) in any client-constructed URL while explicitly asserting
the opaque `code` IS permitted in `?code=` (D-15, `:159-162`).

#### Set-Cookie read discipline (Pitfall 1)

ALWAYS `headers.getSetCookie()` (array), NEVER `.get("Set-Cookie")`. Already enforced at
`roundtrip.e2e.test.ts:135`. Carry forward to the replay assertion above.

#### Comment reconciliation T-03-NN -> THREAT-NN (D-06)

Three header-comment tags need reconciling (comment-only, no assertion change). Exact mapping from
`04-RESEARCH.md:205-211`:
- `roundtrip.e2e.test.ts:14` `T-03-10` -> **THREAT-07** (and THREAT-10 at roundtrip level)
- `roundtrip.e2e.test.ts:22` `T-03-11` -> **THREAT-06** (partitioned-cookie facet; state D-11 honesty boundary)
- `roundtrip.e2e.test.ts:28` `T-03-12` -> **THREAT-06** (consume-context facet; opener drives consume)

The inline `THREAT-07` refs already in the file (e.g. `:47`, `:57`, `:150`) are already canonical -- leave them.
Leave the `T-02-NN` tags in `bridge-route.test.ts`/`consume-route.test.ts` untouched (out of D-06 scope).

#### Anti-patterns (D-14, `04-RESEARCH.md:165, 244-247`)

- Do NOT model `/auth/consume` as a `fetch`/`runPopupFlow` step. Consume is a TOP-LEVEL NAVIGATION (302);
  drive `api.consume(makeRequest(consumeUrl, ...))` directly and assert the 302 + per-chunk `Partitioned`
  `Set-Cookie`. The real-helper hardening (D-01) applies ONLY to the bridge-fetch + postMessage half.
- Do NOT add jsdom/happy-dom (`tsconfig lib: ["ES2022"]`, no DOM lib). Use the `helpers.ts` structural fakes.

---

### `CLAUDE.md` (config) -- MODIFIED (single-line pointer edit, D-08)

**Analog:** self. Exactly ONE line names `docs/architecture.md` and must change.

**Line 125** (under "When extending the project"), current:
```markdown
- Read `docs/architecture.md` and `docs/threat-model.md` at session start.
```
D-08 edit: drop/redirect the `architecture.md` reference since it is intentionally NOT authored this
phase (D-07). Suggested (exact wording is discretion):
```markdown
- Read `docs/threat-model.md` at session start (the invariant registry).
```

**Do NOT touch lines 71 and 73** -- they already point only at `docs/threat-model.md` and carry the
discipline rule ("Any change touching the bridge / consume routes ... requires a corresponding update to
threat-model.md"). D-08 says keep this intact; do not weaken it. Confirmed via grep: `docs/architecture`
appears on line 125 only.

## Shared Patterns

### THREAT-NN citation discipline (D-04)
**Source:** `02-SECURITY.md` (every row cites `file:line` code evidence + `test-file:line` test evidence)
and `04-RESEARCH.md:184-198` (the verified `file :: it-name` map).
**Apply to:** `docs/threat-model.md` rows. Every `test-file::test-name` must resolve to a green test;
verify by re-running `cd packages/core && pnpm test` and grepping cited names before phase gate.

### Pure-Node DI-fake bench (no DOM, no real timers)
**Source:** `packages/core/src/__tests__/helpers.ts` (the six fakes: `makeFakeWindow`, `makeFakePopup`,
`makeFakeOpen`, `makeFakeMessageBus`, `makeFakeOpener`, `makeFakeClock`) + `open-auth-popup.test.ts:43-68`
(the canonical wiring of those fakes into a real helper).
**Apply to:** the hardened roundtrip. Reuse the existing fakes -- do NOT build new ad-hoc fakes
(`04-RESEARCH.md:172-177`).

### Web-standard Request-driven handler calls + getSetCookie()
**Source:** `helpers.ts:34-42` (`makeRequest`), `roundtrip.e2e.test.ts:81-88` (bridge call),
`:128-136` (consume call + `getSetCookie()`).
**Apply to:** every real-handler call in the roundtrip (bridge fetch wrapper, consume, replay).

### Honesty boundary (D-11)
**Source:** `roundtrip.e2e.test.ts:22-26` and `:143-148` (the "EMISSION not enforcement" comment).
**Apply to:** the THREAT-06 partitioned-cookie row in `docs/threat-model.md` AND the reconciled
`T-03-11` comment -- both must state the bench proves attribute emission, not real CHIPS isolation.

## No Analog Found

None. All three target files have strong in-repo analogs.

## Project Convention Notes (from CLAUDE.md)

- Functional style, no classes -- the roundtrip harness stays factory-functions/closures (`helpers.ts`
  already complies). `OpenAuthPopupError extends Error` is the one pre-existing permitted class, not added here.
- `any`/`unknown` casts permitted in `__tests__/` scaffolding only.
- No emoji in `docs/threat-model.md` body or commit messages (emoji OK only in README headings).
- Conventional Commits, atomic: likely `docs(04): add threat-model.md`, `test(04): harden roundtrip`,
  `docs(04): redirect CLAUDE.md pointer`. No `Co-Authored-By` trailer (user global instruction).
- No per-file SPDX/license headers on the new doc or test.
- Test commands run from `packages/core` (no root manifest yet): `cd packages/core && pnpm test`.

## Metadata

**Analog search scope:** `packages/core/src/__tests__/`, `packages/core/src/` (client helpers),
`.planning/phases/02-bridge-consume-routes/02-SECURITY.md`, `CLAUDE.md`, repo-root markdown.
**Files scanned:** 7 (roundtrip.e2e.test.ts, helpers.ts, open-auth-popup.ts, popup-flow.ts,
open-auth-popup.test.ts, 02-SECURITY.md, CLAUDE.md).
**Pattern extraction date:** 2026-06-09
