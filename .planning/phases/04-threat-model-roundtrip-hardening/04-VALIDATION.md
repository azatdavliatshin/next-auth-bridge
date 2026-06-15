---
phase: 4
slug: threat-model-roundtrip-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4.1.8 |
| **Config file** | none — `vitest run` uses defaults (no `vitest.config.*`; `test` script is bare `vitest run`) |
| **Quick run command** | `cd packages/core && npx vitest run src/__tests__/roundtrip.e2e.test.ts` |
| **Full suite command** | `cd packages/core && pnpm test` |
| **Estimated runtime** | ~2 seconds (96+ tests, pure-Node, no DOM runtime) |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/core && npx vitest run src/__tests__/roundtrip.e2e.test.ts`
- **After every plan wave:** Run `cd packages/core && pnpm test` (full 96+ suite)
- **Before `/gsd-verify-work`:** Full suite green AND every `docs/threat-model.md` cited `test::name` resolves to a passing test (D-04)
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | HARDEN-02 | THREAT-01 | Full iframe→popup→bridge→consume→partitioned-cookie roundtrip via REAL helpers; consume driven directly as the real handler returning 302 + Partitioned emission (transport-agnostic — D-09) | integration | `npx vitest run src/__tests__/roundtrip.e2e.test.ts` | ✅ (hardened in place) | ⬜ pending |
| 4-01-02 | 01 | 1 | HARDEN-02 | THREAT-06 | Replay: second consume of same code → 4xx, no cookie | integration | same file | ✅ (added) | ⬜ pending |
| 4-01-03 | 01 | 1 | HARDEN-02 | THREAT-03 | Wrong-origin/mismatched-source postMessage dropped; flow does not resolve (THREAT-03 = postMessage origin+source; NOT THREAT-08/sanitizeNext) | integration | same file | ✅ (added) | ⬜ pending |
| 4-01-04 | 01 | 1 | HARDEN-03 | THREAT-07/09/10 | Session-token value absent from every client-constructed URL; opaque `code` permitted in `?code=` | integration | same file | ✅ (URL sweep kept) | ⬜ pending |
| 4-02-01 | 02 | 2 | HARDEN-01 | all THREAT-NN | `docs/threat-model.md` exists; every row maps property→mitigation→a real green `test::name` | doc + meta-check | `pnpm test` then grep cited names against suite | ❌ W0 (new file) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `docs/threat-model.md` — NEW file; `docs/` directory does not exist yet (HARDEN-01)
- No framework install needed — Vitest is present and the full suite is green (96+ tests)
- No new test file — `roundtrip.e2e.test.ts` is extended in place (D-01)

*Existing test infrastructure covers all phase requirements except the new doc artifact.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real browser CHIPS partition enforcement (cookie actually isolated per top-level site) | THREAT-06 (honesty boundary D-11) | No browser test runtime in this package; the bench proves `Partitioned` attribute *emission* + data flow, never browser partition *enforcement* | Load the embedded flow in Chrome with third-party-cookie phaseout on; confirm cookie is keyed to the partition. Deferred to a future Playwright/browser-runtime effort (out of scope this phase). |
| **Consume transport: does a credentialed `fetch` from the iframe commit the 302-hop `Partitioned` `Set-Cookie` into the iframe partition, OR is a top-level navigation required?** | D-09 / D-14 (unresolved empirical CHIPS question) | The pure-Node bench drives the consume handler directly and cannot model browser cookie commitment on a fetch redirect-hop vs a navigation; Phase 3 and Phase 4 research reached OPPOSITE spec-derived conclusions, neither verified in a browser | **Phase 5 browser check (gates the real client transport):** in Chrome, have the opener iframe issue `fetch('/auth/consume?code=...', { credentials:'include', redirect:'follow' })`; confirm whether the partitioned session cookie is present on a subsequent iframe request. If yes → ship `fetch` (Phase 3's standing preference). If no → the real client must use a top-level navigation instead. **This picks the Phase 5 client transport; do not hard-code "navigation" before it runs.** |

*The threat-model row for the partitioned cookie must state the D-11 emission-not-enforcement boundary explicitly, AND must state the consume transport (fetch vs navigation) as an unresolved empirical question (D-09), not a settled requirement.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`docs/threat-model.md`)
- [ ] No watch-mode flags (`vitest run`, not `vitest`)
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
