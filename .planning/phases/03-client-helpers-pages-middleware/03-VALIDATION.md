---
phase: 3
slug: client-helpers-pages-middleware
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-08
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^4.1.8` (`environment: "node"` — pure-Node, no jsdom) |
| **Config file** | `packages/core/vitest.config.ts` (exists; no change needed) |
| **Quick run command** | `pnpm --filter next-auth-bridge test -- <changed-helper>` (`vitest run`, one-shot, focused file) |
| **Full suite command** | `pnpm test` (root — runs the whole `src/**/*.test.ts` set incl. Phase 1/2 regression) |
| **Estimated runtime** | ~5 s focused file · < 20 s full suite (pure-Node, no real timers/globals) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <changed-helper>` (focused file, < 5 s)
- **After every plan wave:** Run `pnpm test` (full suite, incl. Phase 1/2 regression)
- **Before `/gsd-verify-work`:** Full suite must be green; the D-11 E2E roundtrip is the headline "first end-to-end flow on the bench" criterion (success criterion 5)
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-xx | popup-flow | 1 | CLIENT-01 | — | `runPopupFlow` fetches `/auth/bridge` → `{ code }` → posts `{source:'next-auth-bridge',type:'auth-success',code}` with explicit `targetOrigin` (never `'*'`) | unit (DI fakes) | `pnpm test -- popup-flow` | ❌ W0 | ⬜ pending |
| 3-xx | is-trusted-message | 1 | CLIENT-02 | THREAT-03 | Wrong-**origin** message (origin not in allowlist) rejected → flow does not resolve | unit (pure predicate, zero DOM) | `pnpm test -- is-trusted-message` | ❌ W0 | ⬜ pending |
| 3-xx | is-trusted-message | 1 | CLIENT-02 | THREAT-03 | Wrong-**source** message (`event.source !== popupWin`, same-origin racer) rejected | unit (pure predicate, zero DOM) | `pnpm test -- is-trusted-message` | ❌ W0 | ⬜ pending |
| 3-xx | open-auth-popup | 2 | CLIENT-02 | THREAT-03 | `openAuthPopup` resolves `{ code }` on valid message; rejects (typed) on `auth-error`, popup-closed, timeout; cleans up listener + close-poll on settle | unit (DI fakes) | `pnpm test -- open-auth-popup` | ❌ W0 | ⬜ pending |
| 3-xx | detect-context | 1 | CLIENT-03 | — | Returns `'iframe'` when `self !== top` (and on cross-origin throw); `'browser'` otherwise | unit (fake `window`-like) | `pnpm test -- detect-context` | ❌ W0 | ⬜ pending |
| 3-xx | detect-context | 1 | CLIENT-03 | — | Unknown/unexpected context value routes to **default (browser)** branch — not a type error or thrown case (open-union forward-compat) | unit | `pnpm test -- detect-context` | ❌ W0 | ⬜ pending |
| 3-xx | middleware | 2 | CLIENT-04 | — | Embedded (`Sec-Fetch-Dest: iframe`) unauth → `rewrite` to popup entry; browser → normal redirect/passthrough | unit (Request-like) | `pnpm test -- middleware` | ❌ W0 | ⬜ pending |
| 3-xx | middleware | 2 | CLIENT-04 | — | Forged `Sec-Fetch-Dest` changes only the UX target, never access — vary only the detection signal at fixed auth state; security outcome invariant | unit (negative) | `pnpm test -- middleware` | ❌ W0 | ⬜ pending |
| 3-xx | middleware | 2 | CLIENT-04 | — | **Structural:** middleware module imports no `verifySession`, no store, no `node:crypto` (import-graph / grep assertion — D-10 amend, D-16) | structural/unit | `pnpm test -- middleware` | ❌ W0 | ⬜ pending |
| 3-xx | roundtrip | 3 | CLIENT-05 | THREAT-07 | No **session token** (`authjs.session-token` / `__Secure-…`) appears in any client-constructed URL; the opaque `code` MAY appear in the consume URL (D-15) | unit + E2E assertion | `pnpm test -- roundtrip` | ❌ W0 | ⬜ pending |
| 3-xx | roundtrip | 3 | CLIENT-05 (success #5) | THREAT-07 | **E2E:** iframe → bridge (`200 {code}`) → function-level postMessage sim → consume (`302` + per-chunk `Partitioned` `Set-Cookie`) green on the pure-Node bench | integration (real handlers, in-memory store) | `pnpm test -- roundtrip` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are placeholders (`3-xx`) — the planner assigns concrete plan/wave/task IDs; this map binds requirement → secure behavior → command.*

---

## Wave 0 Requirements

- [ ] `src/__tests__/is-trusted-message.test.ts` — THREAT-03 (wrong-origin AND wrong-source), zero DOM
- [ ] `src/__tests__/popup-flow.test.ts` — CLIENT-01 (`runPopupFlow` data flow + explicit `targetOrigin`)
- [ ] `src/__tests__/open-auth-popup.test.ts` — CLIENT-02 (resolve + all typed rejections + cleanup)
- [ ] `src/__tests__/detect-context.test.ts` — CLIENT-03 (iframe/browser + unknown→default)
- [ ] `src/__tests__/middleware.test.ts` — CLIENT-04 (routing + forged-signal invariance + structural no-store/no-crypto)
- [ ] `src/__tests__/roundtrip.e2e.test.ts` — success criterion 5 + CLIENT-05/THREAT-07
- [ ] Shared DI-fake helpers (fake `window`/`open`/message bus) — extend the existing `src/__tests__/` helper module
- [ ] Framework install: **none** — Vitest config already exists and needs no change.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real CHIPS partition **enforcement** — partitioned cookie set via the opener's consume fetch is isolated to the host partition and invisible from a different top-level site's partition | CLIENT-05 / success #5 | Vitest/node cannot model the browser's partitioned cookie store (D-11 amend). Bench asserts only `Partitioned` attribute *emission* + data flow. | Phase 4 manual/browser check: load the iframe under a real top-level host in Chrome (CHIPS enabled), complete the flow, confirm the cookie is present in the host partition and absent from a different top-level site's partition. |
| `Sec-Fetch-Dest: iframe` actually emitted by a real browser for sub-frame document loads | CLIENT-04 / D-09 | Spec-confirmed (MDN), but live-browser emission is an observation, not a node-bench assertion (node tests inject the header value). | Phase 4/5 observation: inspect request headers on a real sub-frame navigation. |
| Live popup ↔ opener `postMessage` across real windows | CLIENT-01 / CLIENT-02 | Modeled as a function-level simulation on the bench (D-11). | Phase 5 example app on Vercel exercises the live handshake. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (always `vitest run`, never `--watch`)
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
