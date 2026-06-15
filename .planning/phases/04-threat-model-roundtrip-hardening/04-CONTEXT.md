# Phase 4: Threat Model & Roundtrip Hardening - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase writes down the **complete Mode A security story** and proves it end-to-end. It delivers two things and nothing more:

1. **`docs/threat-model.md`** (HARDEN-01) — the canonical, self-contained enumeration of every Mode A security property, each invariant mapped to the specific test that proves it.
2. **A hardened roundtrip integration test** (HARDEN-02 / HARDEN-03) — promotes the existing `roundtrip.e2e.test.ts` to the canonical end-to-end proof: the full iframe → popup → bridge → consume → partitioned-cookie flow on a single origin, with the no-session-token-in-URL property closed at roundtrip level.

Covers requirements **HARDEN-01, HARDEN-02, HARDEN-03**.

**Out of scope (later phases / explicitly excluded):**
- The multi-tenant Entra reference example app and the real `/auth/popup` React component (Phase 5 — EXAMPLE-*).
- Any Mode B / PWA-shell auth flow (`'pwa-shell'` remains a v0.2 stub).
- A full `docs/architecture.md` writeup (see D-08 — the invariant registry is folded INTO threat-model.md this phase; architecture.md is not created).
- Real browser CHIPS partition-enforcement verification (remains the D-11 manual/browser check — this phase does not add a browser test runtime).

</domain>

<decisions>
## Implementation Decisions

### Roundtrip Integration Test (HARDEN-02 / HARDEN-03)

- **D-01 (promote + harden in place):** Treat the existing pure-Node `packages/core/src/__tests__/roundtrip.e2e.test.ts` (shipped in Phase 3, function-level postMessage simulation driving the REAL Phase 2 handlers) as the **canonical** roundtrip. Extend it to drive the **real `openAuthPopup` / `runPopupFlow` client helpers via their DI fakes** end-to-end — rather than a hand-shaped message object — so the integrated flow exercises the actual client surface, not just the route handlers. **Stays dependency-free: no jsdom/happy-dom, no DOM test runtime.** (Rejected adding a jsdom/window-level test — the project has deliberately avoided a DOM runtime; the DI-seam pattern (Phase 3 D-12) already lets the real helpers run pure-Node.)
- **D-02 (fold key negatives into the roundtrip):** The hardened roundtrip test folds in the **two load-bearing trust-boundary negatives at roundtrip level**: (a) **replay** — a second `consume` of the same code fails and sets no cookie; (b) **wrong-origin message rejection** — a `postMessage` from a disallowed origin/mismatched source is dropped and the flow does not resolve. The **entropy / TTL / sanitizeNext / PKCE** invariants stay in their existing focused unit tests (already green from Phases 1–2) and are **mapped** in the threat-model table rather than re-proven at roundtrip level. (Rejected "full negative roundtrip suite": re-proving every invariant end-to-end is redundant with the unit coverage and inflates maintenance; rejected "happy-path only": the replay + wrong-origin boundaries are exactly the integrated paths a unit test cannot fully capture.)

### Threat-Model Document (HARDEN-01)

- **D-03 (invariant-indexed table form):** `docs/threat-model.md` is structured as a **table keyed by the canonical THREAT-NN invariants** (entropy, one-time-use, TTL, no-token-in-URL, PKCE, postMessage origin+source, partitioned cookie, sanitizeNext, full roundtrip). Each row maps **property → mitigation → the specific `test-file::test-name` that proves it**. Concise, traceable, CI-greppable. (Rejected a full STRIDE narrative+matrix as heavier than HARDEN-01 requires; rejected a minimal bullet list as too thin for an external auditor / the Auth.js docs-recipe audience.)
- **D-04 (every invariant row cites a real, passing test):** The table is only valid if every `test-file::test-name` reference resolves to an actually-passing test. The planner/executor must verify each citation against the green suite — a row pointing at a non-existent or failing test is a HARDEN-01 defect. This makes the doc a living traceability artifact, not prose.

### Threat ID Reconciliation

- **D-05 (THREAT-NN is canonical):** `docs/threat-model.md` is the **single source of truth** for security invariants, using the **THREAT-NN** scheme already established in `REQUIREMENTS.md` and `CLAUDE.md`. (Note the namespace rule already in REQUIREMENTS.md: `THREAT-NN` = threat-model invariants; requirement IDs use category prefixes like `HARDEN-`.)
- **D-06 (reconcile the test's `T-03-NN` comments):** `roundtrip.e2e.test.ts` currently annotates threats with a `T-03-NN` scheme in comments. Reconcile these to reference the canonical **THREAT-NN** IDs so the doc's `test::name` citations and the in-test comments agree. (This is a comment/annotation reconciliation, not a behavior change.)

### Documentation Surface

- **D-07 (no separate architecture.md):** Do **NOT** create `docs/architecture.md` this phase. The canonical **invariant registry lives inside `docs/threat-model.md`** (self-contained, one source of truth). (Refines the discussion's earlier "author both docs" direction — consolidated to a single doc to avoid two drifting registries.)
- **D-08 (update CLAUDE.md's pointer):** `CLAUDE.md` currently references `docs/architecture.md` and `docs/threat-model.md` as the invariant sources. Update the CLAUDE.md pointer(s) so they point at `docs/threat-model.md` as the home of the invariant registry, since `architecture.md` is intentionally not authored this phase (D-07). Keep the "any change touching the bridge/consume routes … requires a threat-model.md update" discipline intact.

### Review Addendum — D-14 transport is empirical/unresolved (overrides drift in 04-RESEARCH)

- **D-09 (consume transport — fetch vs navigation is an UNRESOLVED empirical question; do not assert it as settled):** A review caught a **direct contradiction** between phases on the load-bearing CHIPS mechanism. **Phase 3 RESEARCH** concluded, with primary CHIPS citations (privacycg/CHIPS + MDN), that *a credentialed `fetch` from the iframe is sufficient — the partitioned `Set-Cookie` on the 302 hop lands in the iframe's partition; no top-level navigation required* → **Phase 3 chose `fetch` ("prefer fetch") and that remains the STANDING preference.** **Phase 4 RESEARCH** reversed this to *"consume MUST be a navigation, not a fetch — fetch is a D-14 violation"* — but its stated basis is *"derived from `consume-route.ts` + the absence of a client navigation helper,"* which is **not valid evidence about browser CHIPS behaviour** (a non-sequitur: server-handler shape and a missing helper say nothing about whether a credentialed fetch commits a redirect-hop partitioned cookie). **The honest state: this is decidable only in a real browser, and neither phase verified it.** Therefore:
  - The Phase 4 roundtrip test is **transport-agnostic by construction** — it drives `api.consume(makeRequest(...))` (the real handler) directly and asserts the `302` + `Partitioned` attribute *emission*. This assertion is **identical whether the real client later uses fetch or navigation**, so it is correct either way. Test comments and the threat-model row MUST NOT assert "navigation required / fetch is a violation" as settled fact.
  - **Phase 3's `fetch` preference stands** until a real-browser check says otherwise. The fetch-vs-navigation choice for the real client is **deferred to a Phase 5 browser verification** (the example app on Vercel), tracked as the sharpened manual check in 04-VALIDATION.md.
  - Any phrasing in 04-RESEARCH / the plans that calls fetch a "D-14 violation" or asserts "MUST be a navigation" is **superseded by this D-09**: reword to "the bench drives the handler directly and proves emission; the real-client transport (fetch vs navigation) is an unresolved empirical question, verified in a browser in Phase 5." Do **not** silently re-decide D-14 here under the same label.

### Claude's Discretion
- The exact column set and ordering of the threat-model table (beyond property → mitigation → test), the doc's prose intro, and the precise wording of the THREAT-NN ↔ test mapping are left to the planner/executor, provided D-03/D-04 hold.
- How to factor the real-helper-driven roundtrip (D-01) — e.g. a shared DI-fake harness vs inline fakes — is an implementation detail for the planner, as long as it stays pure-Node and reuses the Phase 3 `helpers.ts` DI seam.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Security invariants & requirements
- `.planning/REQUIREMENTS.md` — HARDEN-01/02/03 definitions + the `THREAT-NN` vs requirement-prefix namespace note; the full THREAT-NN invariant list referenced across phases.
- `CLAUDE.md` § "Threat model discipline" — the seven most security-critical invariants summarized, and the rule that bridge/consume/transferStore/cookie/wrapper-detection changes require a threat-model.md update. (This file's pointer is itself updated by D-08.)

### Prior-phase decisions this phase depends on
- `.planning/phases/03-client-helpers-pages-middleware/03-CONTEXT.md` — **D-11** (honesty boundary: bench asserts `Partitioned` emission + data flow, NOT real CHIPS enforcement — partition isolation stays a manual/browser check), **D-14** (fetch-vs-navigate consume transport — **unresolved empirical CHIPS question; see D-09 review addendum above.** Phase 3's "prefer fetch" stands; the bench is transport-agnostic; the real-client choice is a Phase 5 browser check. Note 04-RESEARCH's "navigation required / fetch is a violation" framing is **superseded by D-09**), **D-15** (token-vs-handle URL-hygiene distinction: THREAT-07 asserts the session *token* never appears in a URL; the opaque `code` legitimately may).
- `.planning/phases/02-bridge-consume-routes/` (SUMMARY + CONTEXT) — the locked server contract the roundtrip drives: `/auth/bridge` → `200 { code }` JSON zero-cookie; `/auth/consume` → `302` with `Partitioned` `Set-Cookie`(s); bad/absent/replayed handle → `4xx` no cookie.

### Code the roundtrip + threat-model map against
- `packages/core/src/__tests__/roundtrip.e2e.test.ts` — the Phase 3 e2e being **promoted** (D-01); already encodes the THREAT-07 token sweep and the D-11 honesty boundary in comments.
- `packages/core/src/__tests__/helpers.ts` — the shared DI-fake seam (injected `open`/`fetch`/`postMessage`/clock) the hardened test reuses to drive the real helpers pure-Node.
- `packages/core/src/{is-trusted-message,open-auth-popup,popup-flow,middleware}.ts` and the Phase 2 `bridge-route`/`consume-route` handlers — the real symbols whose invariants the threat-model table cites.

### External references (background, not to be re-derived)
- [CHIPS — Partitioned cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) — the partitioned-cookie semantics behind the D-11 honesty boundary.
- [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) — architectural pattern context (Mode B; informs the threat model's scope statement even though Mode B is out of scope for tests this phase).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `roundtrip.e2e.test.ts`: the existing happy-path + THREAT-07 token-sweep e2e — promoted in place (D-01), not rewritten from scratch.
- `helpers.ts` DI fakes: injected browser globals (`open`, `fetch`, `addEventListener`/`postMessage`, clock) let the real `openAuthPopup`/`runPopupFlow` run on the pure-Node bench with no DOM.
- Phase 1–2 unit tests (entropy/TTL/one-time-use, sanitizeNext, PKCE, partitioned-cookie attributes) — already green; the threat-model table cites these rather than re-proving them (D-02).

### Established Patterns
- **Pure-Node, dependency-injection test bench** (Phase 1 clock seam → Phase 3 D-12 client-helper DI): no jsdom/DOM runtime is added; the hardened roundtrip must follow this (D-01).
- **Web-standard `Request`-driven route tests** (Phase 2): the roundtrip drives the REAL handlers with plain `Request` objects.
- **Honesty-boundary discipline** (Phase 3 D-11): a green bench proves attribute *emission* + data flow, never browser partition *enforcement* — the threat-model row for the partitioned cookie must state this explicitly.

### Integration Points
- `docs/threat-model.md` (NEW — no `docs/` dir exists yet) is created this phase and becomes the artifact CLAUDE.md's threat-model discipline points at (D-08).
- The threat-model table's `test::name` citations bind the doc to the live suite — every cited test must exist and pass (D-04).

</code_context>

<specifics>
## Specific Ideas

- The roundtrip test should route the simulated popup→opener handoff through the **real `isTrustedMessage` predicate** (already done in the Phase 3 e2e) AND, per D-01, through the real `openAuthPopup`/`runPopupFlow` orchestration via DI fakes — so the integrated flow exercises the actual client trust-boundary code, not a hand-shaped message.
- The HARDEN-03 assertion is the **session-token value sweep across every client-constructed URL** (bridge URL + consume URL), explicitly permitting the opaque `code` in the consume `?code=` (D-15) — already the shape in the shipped test; keep and make it the canonical HARDEN-03 proof.

</specifics>

<deferred>
## Deferred Ideas

- **Full `docs/architecture.md`** (component map, data-flow diagrams, both Mode A and Mode B trust boundaries) — out of scope for HARDEN-01; the invariant registry is folded into threat-model.md instead (D-07). Could become its own docs task before/at Phase 6 (release engineering / Auth.js docs recipe).
- **jsdom/happy-dom window-level roundtrip test** — considered (a real `window`/`MessageEvent` channel closer to browser reality) but rejected to keep the bench dependency-free (D-01). Revisit only if a real DOM-level regression is ever suspected.
- **Real browser CHIPS partition-enforcement check** — remains the D-11 manual/browser verification; a future automated browser-runtime test (Playwright et al.) is a separate, larger effort, likely alongside the Phase 5 example app.

</deferred>

---

*Phase: 4-Threat Model & Roundtrip Hardening*
*Context gathered: 2026-06-08*
