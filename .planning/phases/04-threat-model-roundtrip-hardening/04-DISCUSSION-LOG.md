# Phase 4: Threat Model & Roundtrip Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 4-threat-model-roundtrip-hardening
**Areas discussed:** Roundtrip test scope, Threat-model doc form, Threat ID reconciliation, Roundtrip negative cases, architecture.md scope

---

## Roundtrip test scope (HARDEN-02 / HARDEN-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Promote + harden in place | Treat existing pure-Node e2e as canonical; extend to drive the REAL openAuthPopup/runPopupFlow via DI fakes + add HARDEN-03 token sweep. No jsdom. | ✓ |
| Add a jsdom/window-level test | Introduce a DOM environment so postMessage runs through a real window/MessageEvent — adds a test-runtime dependency. | |
| Keep function-level, broaden coverage | Keep function-level sim, add missing negative roundtrip cases without changing simulation style. | |

**User's choice:** Promote + harden in place → CONTEXT D-01
**Notes:** Keeps the project's deliberate no-DOM-runtime stance; reuses the Phase 3 D-12 DI seam to run real helpers pure-Node.

---

## Threat-model doc form (HARDEN-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Invariant-indexed table | Table keyed by THREAT-NN invariants; each row property → mitigation → test-file::test-name. CI-greppable. | ✓ |
| STRIDE narrative + matrix | Fuller STRIDE writeup per category + invariant→test matrix. Heavier. | |
| Minimal invariant list | Lean bullets; lowest maintenance, least auditor context. | |

**User's choice:** Invariant-indexed table → CONTEXT D-03 (and D-04: every cited test must exist and pass)

---

## Threat ID reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| THREAT-NN canonical, author both docs | threat-model.md is SoT using THREAT-NN; reconcile the test's T-03-NN comments; (originally) also author architecture.md. | ✓ |
| Keep test IDs, just map them | Leave T-03-NN in tests; doc provides a mapping column. | |
| Defer architecture.md | Author only threat-model.md; leave architecture.md as a future task. | |

**User's choice:** THREAT-NN canonical → CONTEXT D-05, D-06
**Notes:** The "author both docs" part was refined in the follow-up (see architecture.md area) — consolidated to a single self-contained threat-model.md (D-07).

---

## Roundtrip negative cases (follow-up to Promote + harden)

| Option | Description | Selected |
|--------|-------------|----------|
| Fold key negatives into the roundtrip | Add replay + wrong-origin message rejection to the canonical e2e; leave entropy/TTL/sanitizeNext to existing unit tests, mapped in the table. | ✓ |
| Keep roundtrip happy-path only | Roundtrip proves happy flow + token hygiene; all negatives stay in focused unit tests. | |
| Full negative roundtrip suite | Re-prove every invariant at roundtrip level too. Max confidence, most code. | |

**User's choice:** Fold key negatives into the roundtrip → CONTEXT D-02

---

## architecture.md scope (follow-up to THREAT-NN canonical)

| Option | Description | Selected |
|--------|-------------|----------|
| Thin invariant enumeration | architecture.md gets a focused THREAT-NN invariant registry; threat-model.md references it. | |
| Fold invariants into threat-model only | No architecture.md this phase; invariant registry lives in threat-model.md; update CLAUDE.md pointer. | ✓ |
| Full architecture.md | Complete architecture doc (component map, data flow, both modes). | |

**User's choice:** Fold invariants into threat-model only → CONTEXT D-07, D-08
**Notes:** Refines the earlier "author both docs" answer — one self-contained doc avoids two drifting registries. CLAUDE.md pointer updated accordingly.

---

## Claude's Discretion

- Exact threat-model table columns/ordering beyond property → mitigation → test, doc prose intro, precise THREAT-NN ↔ test wording.
- How to factor the real-helper-driven roundtrip (shared DI-fake harness vs inline fakes), provided it stays pure-Node and reuses `helpers.ts`.

## Deferred Ideas

- Full `docs/architecture.md` (component map, data-flow diagrams, both modes) — future doc task, possibly at Phase 6.
- jsdom/happy-dom window-level roundtrip test — rejected to keep the bench dependency-free; revisit only on a suspected DOM-level regression.
- Real browser CHIPS partition-enforcement check (Playwright et al.) — stays the D-11 manual check; likely paired with the Phase 5 example app.
