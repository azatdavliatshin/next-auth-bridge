---
phase: 1
slug: transferstore-adapters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | none yet — **Wave 0** creates `packages/core/vitest.config.ts` |
| **Quick run command** | `cd packages/core && pnpm test` (package `name: next-auth-bridge`; `pnpm --filter next-auth-bridge test` also resolves) |
| **Full suite command** | `pnpm -r test` (or `cd packages/core && pnpm test` for the single package) |
| **Estimated runtime** | ~5 seconds (small unit suite, no real waits, no real KV) |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/core && pnpm test` (the whole Phase 1 suite is small and fast — run it all)
- **After every plan wave:** Run `cd packages/core && pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-xx-xx | TBD | 1 | STORE-01 | THREAT-02 | Stored entry carries no mode-discriminating field (mode-agnostic; survives to v0.2) | unit (contract) | `pnpm test -t "no mode field"` | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | 1 | STORE-02 | — | In-memory adapter satisfies `TransferStore` with zero external deps | unit (contract) | `pnpm test in-memory` | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | 1 | STORE-03 | — | KV adapter satisfies the same interface (run against in-memory fake) | unit (contract) | `pnpm test kv` | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | 1 | STORE-04 | THREAT-02 | Generated code is 64-char lowercase hex (256-bit CSPRNG); unique across N generations | unit (entropy) | `pnpm test -t "256-bit"` | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | 1 | STORE-05 | THREAT-02 | Second consume of a code returns null; concurrent consumes → exactly one wins | unit (negative) | `pnpm test -t "one-time-use"` | ❌ W0 | ⬜ pending |
| 1-xx-xx | TBD | 1 | STORE-06 | THREAT-02 | consume after clock advance past TTL returns null; `ttlSeconds > 60` rejected at construction | unit (negative) | `pnpm test -t "expiry"` | ❌ W0 | ⬜ pending |

*Both adapters run the same contract suite (D-15), so each STORE-01/04/05/06 row is asserted twice — in-memory directly and the KV adapter against the clock-aware fake. Task IDs are assigned by the planner; this map is the validation contract those tasks must satisfy.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/core/package.json` — name, `exports` map (main + `./store/kv` subpath), deps
- [ ] `packages/core/tsconfig.json` — `strict: true`
- [ ] `packages/core/vitest.config.ts` — framework config
- [ ] `packages/core/tsup.config.ts` — two-entry build (verifies the `./store/kv` subpath resolves)
- [ ] `pnpm-workspace.yaml` — workspace wiring so `pnpm test` resolves `packages/core` (if not present)
- [ ] `src/transfer-store/__tests__/contract.ts` — shared contract suite covering STORE-01/04/05/06
- [ ] `src/transfer-store/__tests__/fake-upstash-redis.ts` — clock-aware fake modeling `set({ ex })` + `getdel` against the injected clock (D-15)
- [ ] Framework install: `pnpm add -D vitest typescript tsup @types/node` + `pnpm add @upstash/redis`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-Upstash roundtrip (live KV instance) | STORE-03 | Vitest cannot depend on a real KV instance (PROJECT.md constraint); contract suite uses the in-memory fake | Exercised later by the Phase 5 Vercel preview, not in Phase 1 |

*True CSPRNG randomness / bit-distribution quality is structural (guaranteed by the single-site `crypto.randomBytes` call per D-01/D-06), not provable in a unit test — the entropy test asserts the contract (length/charset/uniqueness) only.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
