# Phase 1: TransferStore & Adapters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 1-TransferStore & Adapters
**Areas discussed:** Interface shape & signatures, TTL semantics & ownership, Adapter packaging & deps, Error model & test surface

---

## Interface Shape & Signatures

### create() / consume() method shape
| Option | Description | Selected |
|--------|-------------|----------|
| Store generates the code | `create(payload) -> Promise<{ code }>`; `consume(code) -> Promise<payload \| null>`. CSPRNG in one place; STORE-04 by construction. | ✓ |
| Caller supplies the code | `create(code, payload)`; caller generates entropy. Spreads CSPRNG responsibility across callsites. | |
| Return a richer handle | `create() -> { code, expiresAt }`. Surfaces TTL deadline; adds surface to frozen interface. | |

**User's choice:** Store generates the code.
**Notes:** User gave structural rationale (entropy guaranteed by construction; single auditable answer to "where does entropy come from"; Mode B native handler is a future caller) and locked two implementation notes: (1) return an object `Promise<{ code }>` not a primitive, for additive v0.2 fields; (2) `consume` returns `payload | null`, collapsing all three miss modes to `null` for clean negative tests + no timing leakage. Explicitly rejected caller-supplied (silent `Math.random()` regression risk) and rich-handle (speculative `expiresAt`).

### TransferPayload typing
| Option | Description | Selected |
|--------|-------------|----------|
| Fixed concrete type | Single package-defined shape; mode-agnostic by construction. | ✓ |
| Generic over payload | `TransferStore<T>`; threads a type param through every consumer. | |
| Opaque blob | Store never inspects payload; loses compile-time shape checking. | |

**User's choice:** Fixed concrete type.
**Notes:** Phase 2 fills the exact fields (auth-cookie value/name).

### Serialization boundary
| Option | Description | Selected |
|--------|-------------|----------|
| Each adapter owns it | Interface is object-typed; in-memory holds object, KV JSON-stringifies. | ✓ |
| Store strings only | Interface deals in pre-serialized strings; pushes serialization up to callsites. | |
| Shared codec helper | Package-level encode/decode used by both adapters. | |

**User's choice:** Each adapter owns it.

### STORE-01 no-discriminator enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| Test + documented constraint | Test asserts no mode field; type comment cites STORE-01 / v0.2 forward-compat. | ✓ |
| Comment/convention only | Document + rely on PR review; no automated guard. | |
| Defer to Phase 4 | Treat as hardening-phase concern. | |

**User's choice:** Test + documented constraint.

---

## TTL Semantics & Ownership

### TTL configuration location
| Option | Description | Selected |
|--------|-------------|----------|
| Per-store, with hard cap | TTL set at construction, default 60s, clamped/rejected if > 60s; `create()` takes no TTL arg. | ✓ |
| Per-create() call | `create(payload, { ttlSeconds })`; spreads cap enforcement across callsites. | |
| Hardcoded constant | Fixed package constant; can't shorten for tests without a clock seam. | |

**User's choice:** Per-store, with hard cap.

### Expiry enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| KV native TTL + in-memory lazy check | KV sets native EX; in-memory stores `expiresAt`, checks lazily on consume. No timers. | ✓ |
| In-memory timer/sweep | setTimeout/periodic sweep; harder to test deterministically. | |
| Lazy for both | Both store `expiresAt`; doesn't use KV native TTL; leaves expired KV keys lingering. | |

**User's choice:** KV native TTL + in-memory lazy check.

### One-time-use vs expiry atomicity
| Option | Description | Selected |
|--------|-------------|----------|
| Atomic read-and-delete, then validate | Atomically remove first (GETDEL / delete+return prior), then check expiry on removed value. Closes TOCTOU. | ✓ |
| Check-then-delete | Read, validate, then delete; opens a concurrency TOCTOU window. | |
| Defer atomicity detail to research | Lock the invariant, let researcher pick the KV primitive. | |

**User's choice:** Atomic read-and-delete, then validate.

---

## Adapter Packaging & Deps

### KV client reality (research-driven)
| Option | Description | Selected |
|--------|-------------|----------|
| Build on @upstash/redis, keep "Vercel KV" framing | Targets current Vercel-Marketplace Redis (Upstash); native EX + GETDEL. | ✓ |
| Use legacy @vercel/kv anyway | Matches doc wording but builds on a deprecated, maintenance-mode package. | |
| Generic Redis-client interface | Minimal injected Redis interface both clients satisfy; adds wiring for the reference app. | |

**User's choice:** Build on @upstash/redis, keep "Vercel KV" framing.
**Notes:** Surfaced via web search — `@vercel/kv` deprecated Dec 2024, KV migrated to Upstash. Flagged that this partially collapses the v0.2 Upstash-deferral; PROJECT.md/REQUIREMENTS.md wording to be reconciled at transition.

### Packaging / dependency isolation
| Option | Description | Selected |
|--------|-------------|----------|
| Subpath export + optional peer dep | Core+in-memory at main entry; KV at `next-auth-bridge/store/kv`, `@upstash/redis` as optional peer dep. | ✓ |
| Adapter takes an injected client | `createKvStore(redisClient)`; package never imports the client. | |
| Single entry, lazy import | One entry; dynamic-import the client on construct. | |

**User's choice:** Subpath export + optional peer dep.

### Package skeleton depth
| Option | Description | Selected |
|--------|-------------|----------|
| Minimal viable package | `packages/core` with strict tsconfig, Vitest, exports map (main + subpath), build step; publish config deferred to Phase 6. | ✓ |
| Full publish-ready setup now | Complete npm-publishable setup; overlaps Phase 6 RELEASE scope. | |
| Let researcher/planner decide | Lock the working/testable outcome; defer build tool + config depth. | |

**User's choice:** Minimal viable package.

---

## Error Model & Test Surface

### Operational failure vs miss
| Option | Description | Selected |
|--------|-------------|----------|
| Throw on operational failure, null on miss | `null` = security miss (4xx); infra failures throw (5xx/retry). | ✓ |
| Null for everything | Miss and infra both collapse to null; route can't tell forged from outage. | |
| Result object with reason | `{ ok, payload?, reason? }`; contradicts the `payload \| null` decision. | |

**User's choice:** Throw on operational failure, null on miss.

### Deterministic TTL test mechanism
| Option | Description | Selected |
|--------|-------------|----------|
| Injectable clock seam | Optional `now()`/clock in constructor (defaults to `Date.now`); tests advance past TTL. | ✓ |
| Vitest fake timers | `vi.useFakeTimers()`; global time mock, in-memory only. | |
| Tiny TTL + real wait | Sub-second TTL + real sleep; adds wall-clock delay + CI flakiness. | |

**User's choice:** Injectable clock seam.

### KV adapter test strategy
| Option | Description | Selected |
|--------|-------------|----------|
| Shared contract suite + fake Redis | One contract suite run against both adapters; KV against an in-memory Upstash fake. Real-Upstash → Phase 5. | ✓ |
| Contract suite, in-memory only | KV type-checked but not behaviorally tested until Phase 5. | |
| Defer KV test strategy to research | Lock the shared-contract invariant; let researcher pick the test double. | |

**User's choice:** Shared contract suite + fake Redis.

---

## Claude's Discretion

- Exact build tool (`tsup` / `tsc` / other) for the `packages/core` skeleton.
- Exact KV primitive for atomic read-and-delete (`GETDEL` vs Lua vs pipeline) — invariant locked, mechanism open.
- The specific in-memory Upstash-client fake (hand-rolled vs existing test double).

## Deferred Ideas

- Reconcile PROJECT.md / REQUIREMENTS.md wording with the @upstash/redis decision (D-10) at the phase transition — partially collapses the v0.2 Upstash deferral.
- `expiresAt` / `attemptCount` / telemetry fields on the `create()` return — reserved for v0.2 via the object return type, intentionally out of v1.
