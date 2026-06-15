# Phase 1: TransferStore & Adapters - Research

**Researched:** 2026-06-05
**Domain:** TypeScript library packaging + serverless KV (Upstash Redis) + deterministic security testing (Vitest)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

> The interface shape and most implementation decisions are LOCKED (D-01..D-15). This research
> resolves ONLY the open questions; it does not re-litigate locked decisions.

### Locked Decisions (D-01..D-15 — verbatim summary)
- **D-01:** Store generates the code — `create(payload): Promise<{ code: string }>`; `crypto.randomBytes(32).toString('hex')` lives in exactly one place.
- **D-02:** `create()` returns an **object** `Promise<{ code: string }>`, never a bare `Promise<string>` (additive room for `expiresAt` in v0.2).
- **D-03:** `consume(code): Promise<TransferPayload | null>` — all three miss modes (not-found / expired / already-consumed) collapse to `null`. No timing signal distinguishing them.
- **D-04:** `TransferPayload` is a fixed concrete package-defined type, mode-agnostic. Fields finalized in Phase 2.
- **D-05:** Each adapter owns serialization. In-memory holds the object directly; KV adapter JSON-stringifies on write / parses on read.
- **D-06:** STORE-01 "no mode-discriminating fields" enforced by a test + a comment on `TransferPayload` citing STORE-01 / v0.2 forward-compat.
- **D-07:** TTL configured per-store at construction (`new InMemoryStore({ ttlSeconds: 60 })`), default 60s, **clamped/rejected if > 60s**. `create()` takes no TTL arg.
- **D-08:** Expiry: KV uses native TTL (`EX`); in-memory stores `expiresAt` and checks lazily on `consume()`. No background timers/sweeps.
- **D-09:** `consume()` is atomic read-and-delete, then validate. KV: `GETDEL`; in-memory: delete + return prior value. Then check expiry on removed value.
- **D-10:** Production ("Vercel KV") adapter built on `@upstash/redis`, keeping the "Vercel KV" framing.
- **D-11:** Subpath export `next-auth-bridge/store/kv` + `@upstash/redis` as **optional `peerDependency`**. Main entry never pulls in `@upstash/redis`.
- **D-12:** Minimal viable package skeleton (`packages/core`): strict tsconfig, Vitest, exports map (main + `./store/kv`), build step. Full publish config deferred to Phase 6.
- **D-13:** Throw on operational failure, `null` on miss. `null` reserved strictly for the security-meaningful miss path.
- **D-14:** Injectable clock seam — constructor accepts optional `now()` (defaults to `Date.now`).
- **D-15:** One shared `TransferStore` contract suite runs against both adapters — in-memory directly, KV against an in-memory fake of the Upstash client.

### Claude's Discretion (researched below)
- Exact build tool (`tsup`/`tsc`/other) for the skeleton.
- Exact KV primitive for atomic read-and-delete (`GETDEL` vs Lua vs pipeline).
- The in-memory Upstash-client fake (hand-rolled vs existing test double).

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- PROJECT.md / REQUIREMENTS.md wording reconciliation re: D-10 (handle at `/gsd-transition` or a small docs commit).
- `expiresAt` / `attemptCount` / telemetry fields on the `create()` return (v0.2 / Mode B).
- Real-Upstash roundtrip (exercised by the Phase 5 Vercel preview, not Phase 1).
- Full publish config: dual ESM+CJS, files/npmignore (Phase 6 / RELEASE-*).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STORE-01 | `TransferStore` interface: `create(payload)`, `consume(code)`, TTL semantics, mode-agnostic (no popup/PWA fields) | Interface locked (D-01/D-03); no-mode-field test pattern (Pitfall 4); subpath/peer-dep packaging (Standard Stack) |
| STORE-02 | In-memory adapter for test bench (zero external deps) | Plain `Map<string, {payload, expiresAt}>` + injectable clock; no dependency (Architecture Patterns) |
| STORE-03 | Vercel KV adapter for cross-invocation state on Vercel serverless | `@upstash/redis` 1.38.0 verified; `set({ex})` + `getdel` confirmed; `fromEnv()` reads `KV_REST_API_*` fallback (Standard Stack, Code Examples) |
| STORE-04 | Codes are 256-bit CSPRNG hex (THREAT-02 — entropy) | `crypto.randomBytes(32).toString('hex')` = 64-char hex = 256 bits **verified empirically**; entropy test assertions (Validation Architecture) |
| STORE-05 | One-time-use — second `consume` fails (THREAT-02) | Atomic delete-first via `getdel`/Map-delete; deterministic concurrency test strategy (Pitfall 1, Validation Architecture) |
| STORE-06 | TTL ≤ 60s; expired codes fail `consume` (THREAT-02) | Construction-time clamp (D-07); injectable clock seam for deterministic expiry tests; fake must model `EX` against injected clock (Pitfall 2) |
</phase_requirements>

## Summary

Phase 1 is greenfield: no `packages/`, `package.json`, or `tsconfig` exist yet. The work is to stand up a minimal strict-TypeScript library skeleton under `packages/core`, define the locked `TransferStore` interface, implement two adapters (in-memory + a `@upstash/redis`-backed "Vercel KV" adapter at the `./store/kv` subpath), and prove the three security invariants (entropy, one-time-use, TTL) with one shared, adapter-agnostic Vitest contract suite that uses an injectable clock and a hand-rolled in-memory fake of the Upstash client.

The single highest-value research finding confirms and sharpens D-10: `@vercel/kv@3.0.0` carries an **active npm deprecation notice** ("Vercel KV is deprecated … moved to Upstash Redis"), and `@upstash/redis@1.38.0` (published 2026-06-05) natively exposes both primitives this phase needs — `set(key, value, { ex: seconds })` for native TTL (D-08) and `getdel<T>(key): Promise<T | null>` for atomic read-and-delete (D-09). A subtle but important corollary: **the Upstash SDK auto-serializes objects with `JSON.stringify` on write and auto-deserializes with `JSON.parse` on read by default**. This directly affects D-05's "KV adapter JSON-stringifies on write / parses on read" — done naively it would double-encode. The adapter should rely on the SDK's built-in (de)serialization and pass the typed `TransferPayload` object straight through, OR set `automaticDeserialization: false` and own the JSON itself. The planner must pick one explicitly (see Open Question 1).

`Redis.fromEnv()` reads `UPSTASH_REDIS_REST_URL` || `KV_REST_API_URL` and `UPSTASH_REDIS_REST_TOKEN` || `KV_REST_API_TOKEN` — the `KV_REST_API_*` fallback means a Vercel-Marketplace-provisioned Upstash store wires up with zero adapter changes, which is exactly the Phase 5 preview path.

**Primary recommendation:** Build the skeleton with **`tsup`** (zero-config, handles the subpath entry + `.d.ts` emission in one step). Implement the KV adapter against `@upstash/redis`'s native `set({ex})` + `getdel`. Use a **hand-rolled in-memory fake** of the Upstash client (~30 lines, implementing only `set`, `get`, `getdel` honoring `{ex}` against the injected clock) — there is no official Upstash test double, and `ioredis-mock` targets a different (ioredis, not HTTP) API. Drive all TTL tests through the D-14 injectable clock; never use real waits or global timer mocks.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Code generation (256-bit CSPRNG) | Library / Node core (`crypto`) | — | D-01 centralizes entropy in the store; `crypto.randomBytes` is the platform CSPRNG, no dependency |
| Handle persistence (in-memory) | Library (process memory) | — | STORE-02 test-bench backend; a `Map` in the store instance |
| Handle persistence (production) | Database / Storage (Upstash Redis over HTTP) | Library adapter | STORE-03 cross-invocation state; serverless invocations don't share memory |
| TTL enforcement | Storage (KV: native `EX`) / Library (in-memory: lazy `expiresAt` check) | — | D-08 split ownership; backend evicts for KV, store checks for in-memory |
| Atomicity (one-time-use) | Storage (KV: `GETDEL`) / Library (in-memory: `Map.delete` returns prior) | — | D-09; the delete-first primitive lives at the persistence tier |
| Serialization | Library adapter (per-adapter, D-05) | SDK (Upstash auto-(de)serialize) | Each adapter owns its wire format; KV must reconcile with SDK auto-serialization |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/redis` | `1.38.0` `[VERIFIED: npm registry — but ASSUMED for recommendation per provenance rule; confirmed via official Upstash docs + GitHub source]` | KV adapter backend (D-10) | Non-deprecated client for Vercel KV / Marketplace Upstash stores; native `set({ex})` + `getdel`; HTTP-based (works on Vercel serverless/edge). 3.59M weekly downloads. `[CITED: upstash.com/docs/redis/sdks/ts]` |
| `typescript` | `5.x` (latest) | Strict TS compile | CLAUDE.md mandates `strict: true`, no `any` |
| `vitest` | `4.1.8` `[CITED: CLAUDE.md mandates Vitest]` | Test runner | Project-mandated test framework (CLAUDE.md). See Package Legitimacy Audit re: slopcheck false-positive. |
| `tsup` | `8.5.1` `[VERIFIED: npm registry; ASSUMED for recommendation]` | Build / bundle / `.d.ts` emit | Zero-config esbuild wrapper; handles multi-entry (main + `./store/kv` subpath) + declaration emit in one command. 6.1M weekly downloads. |
| Node `crypto` | built-in (Node 22) | 256-bit CSPRNG (`randomBytes`) | Standard library; no dependency; D-01 entropy source |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/node` | latest | Node types for `crypto`, `process.env` | Always (dev dependency) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tsup` | bare `tsc` | `tsc` emits types natively but no bundling; the multi-entry subpath build needs two `tsc` invocations or a manual `exports` map pointing at raw `dist/**` tree. Workable and zero-dep, but more `package.json`/config plumbing. Acceptable fallback if avoiding a build dep is desired. |
| `tsup` | `unbuild` | Comparable zero-config; `tsup` has wider adoption and simpler multi-entry. No strong reason to prefer unbuild here. |
| `@upstash/redis` | `@vercel/kv` | **DEPRECATED** — `@vercel/kv@3.0.0` carries an active npm deprecation notice. Do not use. `@vercel/kv` was a thin wrapper over `@upstash/redis` anyway. |
| hand-rolled fake | `ioredis-mock` | `ioredis-mock` emulates the `ioredis` API (command methods, connection model), NOT the `@upstash/redis` HTTP client surface (`set(k,v,{ex})`, `getdel<T>()`). Wrong shape; would require an adapter-over-adapter. Hand-roll a ~30-line fake instead. |

**Installation:**
```bash
# in packages/core
pnpm add -D typescript tsup vitest @types/node
pnpm add @upstash/redis   # declared as optional peerDependency (D-11), not a hard dep
```

> Note on D-11 packaging: `@upstash/redis` is an **optional `peerDependency`** of the published package (consumers who use the KV subpath install it; test-bench consumers don't). For local development/testing of the KV adapter inside this repo, install it as a `devDependency` so the contract suite and types resolve.

**Version verification (performed this session):**
- `npm view @upstash/redis version` → `1.38.0` (published `2026-06-05`, created 2021-10-22) — VERIFIED current
- `npm view @vercel/kv deprecated` → returns deprecation message — VERIFIED deprecated
- `npm view tsup version` → `8.5.1` — VERIFIED
- `npm view vitest version` → `4.1.8` — VERIFIED

## Package Legitimacy Audit

> slopcheck 0.6.1 was installed and run against the npm ecosystem this session.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@upstash/redis` | npm | ~4.6 yrs (2021-10) | 3.59M/wk | github.com/upstash/redis-js | [OK] | Approved |
| `tsup` | npm | ~6 yrs (2020-05) | 6.13M/wk | github.com/egoist/tsup | [OK] | Approved |
| `typescript` | npm | mature | — | github.com/microsoft/TypeScript | [OK] | Approved |
| `vitest` | npm | mature | 6M+/wk | github.com/vitest-dev/vitest | [SUS] | **Override — keep** (false positive) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — flagged with "Suspiciously close to 'vite'. Could be a typosquat." This is a **false positive**: `vitest` is the project's CLAUDE.md-mandated test framework, has 6M+ weekly downloads, an official `vitest-dev/vitest` repo, and is the canonical test runner in the Vite ecosystem. The heuristic misfires precisely because vitest is intentionally named adjacent to vite. **Disposition: keep, no human checkpoint needed** — its legitimacy is independently established by CLAUDE.md and ecosystem ubiquity. (If the planner wants belt-and-suspenders, a single `checkpoint:human-verify` confirming "vitest is the intended runner" is harmless, but the constraint already mandates it.)

**Postinstall check (Node phase):** `npm view @upstash/redis scripts.postinstall` and `tsup scripts.postinstall` → neither declares a postinstall script. No network/filesystem side-effects on install.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────┐
   caller (Phase 2       │           TransferStore             │
   /auth/bridge)  ──────▶│   create(payload): {code}           │
                         │     │                               │
                         │     └─▶ crypto.randomBytes(32)      │
                         │          .toString('hex')  ─── 256-bit code
                         │                                     │
   caller (Phase 2       │   consume(code): Payload | null     │
   /auth/consume) ──────▶│     │                               │
                         │     └─▶ atomic delete-first ──┐     │
                         └──────────────────────────────┼─────┘
                                                        │
                    ┌───────────────────────────────────┴────────────────────┐
                    ▼ (in-memory adapter)                  ▼ (KV adapter, ./store/kv)
       ┌────────────────────────────┐          ┌──────────────────────────────────┐
       │ Map<code,{payload,expiresAt}>│          │ @upstash/redis                   │
       │ create: map.set, now()+ttl  │          │ create: set(code,payload,{ex:ttl})│
       │ consume: read+delete,        │          │ consume: getdel<Payload>(code)   │
       │          then check expiresAt│          │   (native EX eviction handles TTL)│
       │   (clock = injected now())   │          └──────────────┬───────────────────┘
       └────────────────────────────┘                          │
                    ▲                                            ▼ (prod)        ▼ (test)
                    │                              ┌──────────────────┐  ┌──────────────────┐
       shared contract suite (D-15)                │ real Upstash REST │  │ in-memory FakeRedis│
       runs here directly ─────────────────────────┤ (Phase 5 preview) │  │ honors {ex} vs    │
                                                    └──────────────────┘  │ injected clock     │
                                                                          └──────────────────┘
```

Trace the primary path: a Phase 2 route calls `create(payload)` → the store mints a 256-bit code and persists `{payload, expiry}` → returns `{ code }`. Later a route calls `consume(code)` → the store atomically removes the entry → validates expiry → returns the `TransferPayload` (or `null`). The same interface and the same contract suite cover both adapters; only the persistence tier differs.

### Recommended Project Structure
```
packages/core/
├── package.json              # exports map (main + ./store/kv), optional peerDep
├── tsconfig.json             # strict: true
├── tsup.config.ts            # two entries: src/index.ts + src/transfer-store/kv.ts
├── vitest.config.ts
└── src/
    ├── index.ts              # main entry: re-exports TransferStore, TransferPayload, InMemoryStore
    └── transfer-store/
        ├── types.ts          # TransferStore interface, TransferPayload type (D-04, with STORE-01 comment)
        ├── generate-code.ts  # crypto.randomBytes(32).toString('hex') — the ONE entropy site (D-01)
        ├── in-memory.ts      # InMemoryStore (STORE-02)
        ├── kv.ts             # KVStore — the ./store/kv subpath entry (STORE-03), imports @upstash/redis
        └── __tests__/
            ├── contract.ts          # the shared, adapter-agnostic suite (D-15) — a function taking a store factory
            ├── in-memory.test.ts    # runs contract(makeInMemory) + in-memory-specific cases
            ├── kv.test.ts           # runs contract(makeKvWithFake) using FakeUpstashRedis
            └── fake-upstash-redis.ts # ~30-line hand-rolled fake (set/get/getdel honoring {ex} + injected clock)
```
> Path note: CLAUDE.md's architecture pointers name `packages/core/src/transfer-store/` as the designated home — follow it. (CLAUDE.md also lists a future `transfer-store/` adapter dir; the kebab-case `transfer-store/` is the canonical spelling there.)

### Pattern 1: Adapter-agnostic contract suite (D-15)
**What:** A single exported function `runTransferStoreContract(makeStore: (opts) => TransferStore)` containing all entropy/one-time-use/expiry/atomicity/error-model assertions. Each adapter's test file calls it with a factory.
**When to use:** Always for this phase — it is the mechanism that proves both adapters satisfy identical semantics.
**Example:**
```ts
// src/transfer-store/__tests__/contract.ts
// Each test constructs a store via the factory so the same suite drives both adapters.
export function runTransferStoreContract(
  makeStore: (opts: { ttlSeconds?: number; now?: () => number }) => TransferStore,
) {
  it("generates 256-bit (64-hex-char) codes", async () => { /* ... */ });
  it("second consume of the same code returns null (one-time-use)", async () => { /* ... */ });
  it("consume after TTL returns null (expiry)", async () => { /* advance injected clock */ });
  it("concurrent consumes: exactly one wins", async () => { /* Promise.all, assert one payload + one null */ });
}
```

### Pattern 2: Injectable clock seam (D-14)
**What:** Constructor accepts `now?: () => number` defaulting to `Date.now`. Tests pass a mutable closure.
**Example:**
```ts
let clock = 0;
const now = () => clock;
const store = makeStore({ ttlSeconds: 60, now });
const { code } = await store.create(payload);
clock += 61_000;                 // advance past TTL — no real wait
expect(await store.consume(code)).toBeNull();
```

### Pattern 3: KV adapter reconciled with SDK auto-(de)serialization (D-05)
**What:** `@upstash/redis` already `JSON.stringify`s on `set` and `JSON.parse`s on `getdel<T>`. Pass the typed object straight through and type the read — do **not** stringify yourself (that double-encodes).
**Example:**
```ts
// Source: upstash.com/docs/redis/sdks/ts (set with {ex}, typed getdel)
async create(payload: TransferPayload): Promise<{ code: string }> {
  const code = generateCode();
  await this.redis.set(code, payload, { ex: this.ttlSeconds }); // SDK serializes; EX = native TTL (D-08)
  return { code };
}
async consume(code: string): Promise<TransferPayload | null> {
  return await this.redis.getdel<TransferPayload>(code);        // atomic read+delete (D-09); SDK deserializes; null on miss
}
```
> Native `EX` eviction means the KV adapter does NOT need its own `expiresAt` check on the happy path — but see Pitfall 2: the *fake* must model `EX` against the injected clock for the contract suite to stay adapter-agnostic.

### Anti-Patterns to Avoid
- **Double-serializing in the KV adapter:** `redis.set(code, JSON.stringify(payload))` then `JSON.parse(getdel())` — the SDK already (de)serializes, so this stores `"\"{...}\""` and breaks the type. Either pass the object through (default) or set `automaticDeserialization: false` and own JSON consistently. Pick one.
- **Using a real timer / `setTimeout` / real `await sleep` for TTL tests:** flaky and slow. Use the injected clock (D-14).
- **Using `vi.useFakeTimers()` globally:** D-14 deliberately avoids global timer mocking; the seam is explicit and adapter-agnostic. Don't reach for fake timers.
- **A pipeline/MULTI for atomicity instead of `getdel`:** Upstash over HTTP does not give MULTI/EXEC transactional semantics the way you'd want here; `getdel` is a single atomic server-side command and is the correct primitive (D-09).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 256-bit CSPRNG | custom byte generator / `Math.random` | `crypto.randomBytes(32).toString('hex')` | Platform CSPRNG; `Math.random` is not cryptographic — a single slip is a silent STORE-04 regression (D-01 rationale) |
| Atomic read-and-delete on KV | get-then-del two-step | `@upstash/redis` `getdel` | Two-step has a TOCTOU race; `getdel` is one atomic server command (closes STORE-05 under concurrency) |
| Native TTL on KV | manual expiry bookkeeping | `set(k, v, { ex })` + backend eviction | Backend owns eviction; no sweep loop, no drift |
| JSON (de)serialization on KV | manual `JSON.stringify`/`parse` wrapper | SDK default (or `automaticDeserialization:false`, owned once) | SDK already does it; hand-rolling on top double-encodes |
| TS build + types + subpath | hand-written rollup config | `tsup` multi-entry | Zero-config esbuild; emits `.d.ts` and both entries |

**Key insight:** The two security-critical primitives this phase rests on — CSPRNG and atomic delete — are both single-call platform/SDK features. Hand-rolling either is strictly worse and is exactly the class of "silent regression no test catches" the locked decisions (D-01, D-09) were written to prevent.

## Runtime State Inventory

> Greenfield phase — no rename/refactor/migration. Section omitted (no pre-existing runtime state to inventory; repo holds only `.planning/`, `CLAUDE.md`, `README.md`, `LICENSE`, `.githooks/`).

## Common Pitfalls

### Pitfall 1: Concurrency test for in-memory is structural, not timing-based
**What goes wrong:** The planner writes a `Promise.all([consume(c), consume(c)])` "concurrency" test expecting it to stress a race, then worries it's flaky.
**Why it happens:** Node's event loop is single-threaded. For the in-memory adapter, the atomicity guarantee is **structural**: `consume` reads-and-deletes from the `Map` synchronously before any `await` yields, so two consumes can never both observe the entry. The `Promise.all` test still has value — it asserts the *contract* (exactly one non-null result, one null) — but it is deterministic by construction, not a probabilistic race.
**How to avoid:** Frame the in-memory atomicity test as a contract assertion ("exactly one of two concurrent consumes returns the payload, the other null"). For the KV fake, the same assertion holds because the fake's `getdel` deletes synchronously in its in-memory map. No real concurrency primitive needed; no flake possible.
**Warning signs:** A test that adds artificial delays or retries to "make the race happen" — unnecessary; remove it.

### Pitfall 2: The fake must model `EX` expiry against the injected clock
**What goes wrong:** The contract suite's expiry test advances the injected clock and expects `consume` to return `null`. In-memory honors this via its lazy `expiresAt` check. But the KV adapter relies on **native `EX` eviction**, which the real server does on wall-clock time — the fake won't evict unless it's told to.
**Why it happens:** D-08 splits expiry ownership (in-memory: lazy check; KV: native `EX`). The contract suite is clock-driven; the fake must therefore model `EX` against the *same* injected clock, not real time.
**How to avoid:** The hand-rolled `FakeUpstashRedis` takes the same `now()` clock. `set(k, v, { ex })` records `expireAt = now() + ex*1000`. `getdel`/`get` first check `now() >= expireAt` → treat as missing (return `null`) and delete. This makes the KV path's expiry deterministic and clock-driven, keeping the contract suite adapter-agnostic. **Flag for planner:** the fake's clock wiring is the linchpin that lets ONE suite cover both adapters.
**Warning signs:** Expiry test passes for in-memory but the KV-fake test hangs or returns stale data after clock advance → the fake isn't honoring `ex` against the injected clock.

### Pitfall 3: SDK auto-(de)serialization double-encoding
**What goes wrong:** KV adapter stringifies before `set`, so reads come back as a JSON string of a JSON string, or the type is `string` not `TransferPayload`.
**Why it happens:** `@upstash/redis` `set` calls `JSON.stringify` for non-strings and `get`/`getdel` call `JSON.parse` by default.
**How to avoid:** Choose ONE: (a) pass the object through and rely on SDK serialization (`getdel<TransferPayload>` returns the typed object) — simplest, recommended; or (b) construct the client with `automaticDeserialization: false` and own all JSON in the adapter. Document the choice in a comment. D-05 ("each adapter owns serialization") is satisfied either way — option (b) is the more literal reading of D-05, option (a) is less code. Recommend (a) with a comment noting the SDK does the (de)serialization on the adapter's behalf.
**Warning signs:** `consume` returns a string, or `JSON.parse` errors on a value that's already an object.

### Pitfall 4: TTL clamp must reject/clamp at construction, and the test must prove it
**What goes wrong:** STORE-06's ≤60s cap (D-07) is implemented but a caller passing `ttlSeconds: 120` silently gets 120s.
**Why it happens:** Forgetting the construction-time guard, or putting the check in `create()` instead of the constructor.
**How to avoid:** Validate in the constructor (both adapters): `ttlSeconds > 60` → either clamp to 60 or throw. D-07 says "clamped/rejected" — planner picks; recommend **throw** (a misconfiguration is an operational error per D-13's spirit, and a clamp could mask a security-relevant config mistake). Add a contract test asserting the guard.
**Warning signs:** No test exercising `ttlSeconds > 60`.

### Pitfall 5: `peerDependency` not installed during local test
**What goes wrong:** The contract suite imports the KV adapter, which imports `@upstash/redis`, but it's declared only as an optional peer dep → types/import fail in CI.
**Why it happens:** Optional peer deps aren't auto-installed.
**How to avoid:** Add `@upstash/redis` as a `devDependency` of `packages/core` (in addition to the optional peer dep declaration) so local dev + CI resolve it. The published `dependencies` stay clean (D-11).

## Code Examples

### Generate the 256-bit code (the one entropy site — D-01 / STORE-04)
```ts
// Source: Node crypto stdlib; verified empirically this session (len 64, /^[0-9a-f]+$/, 100k unique)
import { randomBytes } from "node:crypto";
export function generateCode(): string {
  return randomBytes(32).toString("hex"); // 32 bytes = 256 bits = 64 hex chars
}
```

### KV adapter set with native TTL + atomic getdel (STORE-03 / D-08 / D-09)
```ts
// Source: upstash.com/docs/redis/sdks/ts/commands/string/set and .../getdel — verified this session
import { Redis } from "@upstash/redis";
// construction (D-10): explicit, or Redis.fromEnv()
const redis = new Redis({ url, token });            // or Redis.fromEnv()
await redis.set(code, payload, { ex: ttlSeconds }); // ex = TTL in seconds (px = ms)
const payload = await redis.getdel<TransferPayload>(code); // T | null, atomic read+delete
```

### Client construction from env (informs Phase 5 wiring)
```ts
// Source: github.com/upstash/redis-js packages/redis/platforms/nodejs.ts — verified this session
// Redis.fromEnv() reads:
//   url   = process.env.UPSTASH_REDIS_REST_URL   || process.env.KV_REST_API_URL
//   token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
const redis = Redis.fromEnv(); // Vercel-Marketplace Upstash store sets KV_REST_API_* → works unchanged
```

### Hand-rolled fake Upstash client (D-15, ~30 lines, clock-aware)
```ts
// Implements ONLY what the KV adapter uses: set(k,v,{ex}), get, getdel — honoring {ex} vs injected clock.
export function createFakeUpstashRedis(now: () => number) {
  const store = new Map<string, { value: unknown; expireAt: number | null }>();
  const live = (k: string) => {
    const e = store.get(k);
    if (!e) return undefined;
    if (e.expireAt !== null && now() >= e.expireAt) { store.delete(k); return undefined; }
    return e;
  };
  return {
    async set(k: string, v: unknown, opts?: { ex?: number }) {
      store.set(k, { value: v, expireAt: opts?.ex != null ? now() + opts.ex * 1000 : null });
      return "OK";
    },
    async get<T>(k: string): Promise<T | null> { return (live(k)?.value as T) ?? null; },
    async getdel<T>(k: string): Promise<T | null> {
      const e = live(k); if (!e) return null;
      store.delete(k); return e.value as T;
    },
  };
}
```
> The KV adapter should accept its Redis client by injection (constructor param) so the contract suite can pass either the real `Redis` (Phase 5) or this fake (Phase 1). This is also cleaner DI for testing per ecosystem best practice.

### package.json exports map (D-11 / D-12)
```jsonc
{
  "name": "next-auth-bridge",
  "exports": {
    ".":          { "types": "./dist/index.d.ts",        "import": "./dist/index.js" },
    "./store/kv": { "types": "./dist/store/kv.d.ts",     "import": "./dist/store/kv.js" }
  },
  "peerDependencies":     { "@upstash/redis": "^1.38.0" },
  "peerDependenciesMeta": { "@upstash/redis": { "optional": true } },
  "devDependencies":      { "@upstash/redis": "^1.38.0", "tsup": "^8.5.1", "vitest": "^4.1.8", "typescript": "^5", "@types/node": "*" }
}
```
> Phase 1 minimal (D-12): ESM-only `import` is enough to compile/test/resolve the subpath. Dual ESM+CJS, `files`, `.npmignore`, `main`/`module` legacy fields are deferred to Phase 6.

### tsup config (two entries → subpath build)
```ts
// tsup.config.ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", "store/kv": "src/transfer-store/kv.ts" },
  format: ["esm"],   // Phase 1 minimal; dual format deferred to Phase 6
  dts: true,
  clean: true,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@vercel/kv` as the Vercel KV client | `@upstash/redis` (Vercel KV stores migrated to Upstash; Marketplace integration) | Dec 2024 (deprecation), confirmed active on npm 2026-06 | D-10: build the "Vercel KV" adapter on `@upstash/redis`; `KV_REST_API_*` env fallback bridges old Vercel KV env names |
| `get` + `del` two-step | `getdel` single atomic command | available in `@upstash/redis` (Redis 6.2+ `GETDEL`) | D-09 atomic read-and-delete is a one-liner |

**Deprecated/outdated:**
- `@vercel/kv@3.0.0`: actively deprecated on npm. Do not add it. (Verified via `npm view @vercel/kv deprecated`.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tsup` is the best skeleton build tool (vs `tsc`) | Standard Stack | LOW — `tsc` is a documented zero-dep fallback; choice is reversible and isolated to the skeleton |
| A2 | Recommend **throw** (not clamp) on `ttlSeconds > 60` | Pitfall 4 | LOW — D-07 permits either; planner/user can choose clamp. Throw is the safer default. |
| A3 | Recommend option (a): rely on SDK auto-(de)serialization vs (b) own JSON | Pitfall 3 / Pattern 3 | LOW-MEDIUM — both satisfy D-05; (a) is less code, (b) is the more literal D-05 reading. Surfaced as Open Question 1 for an explicit planner decision. |
| A4 | Hand-rolled fake over any community Upstash mock | Standard Stack | LOW — confirmed no official Upstash test double exists; `ioredis-mock` is the wrong API surface |
| A5 | Package names (`@upstash/redis`, `tsup`, `vitest`) | Standard Stack | LOW — discovered via official Upstash docs/GitHub + CLAUDE.md; registry-verified; slopcheck OK (vitest false-positive explained) |

## Open Questions (RESOLVED)

> Resolved during planning (Phase 1). All three are now decided in the plans' `<resolved_open_questions>` blocks; markers below are the source-of-truth record.

1. **D-05 serialization strategy: rely on SDK auto-(de)serialization, or own JSON explicitly?**
   - What we know: `@upstash/redis` auto-`JSON.stringify`s on `set` and auto-`JSON.parse`s on `getdel<T>` by default; `automaticDeserialization: false` disables it.
   - What's unclear: whether the user/planner prefers the literal D-05 reading ("KV adapter JSON-stringifies on write / parses on read" → option b, own JSON with deserialization off) or the minimal-code reading (option a, pass object through).
   - Recommendation: Default to **option (a)** with a code comment stating the SDK performs (de)serialization on the adapter's behalf (so D-05's "adapter owns serialization" is satisfied by the adapter's deliberate choice of SDK behavior). If a reviewer reads D-05 strictly, switch to (b). Either way, never double-encode (Pitfall 3).
   - **RESOLVED:** option (a) — rely on the `@upstash/redis` SDK auto-(de)serialization (no manual `JSON.stringify` — avoids double-encode); the adapter carries a comment citing D-05.

2. **TTL guard: clamp to 60 or throw on `> 60`?**
   - D-07 says "clamped/rejected." Recommend **throw** (misconfiguration surfaced loudly; a silent clamp could hide a security-relevant config error). Planner to confirm.
   - **RESOLVED:** THROW at construction on `ttlSeconds > 60`.

3. **`TransferPayload` placeholder shape for Phase 1.**
   - D-04 says fields are finalized in Phase 2. Phase 1 needs *some* concrete type to compile/test. Recommend a minimal placeholder (e.g. `{ authCookieValue: string }` or even a documented-as-provisional single field) with a comment citing STORE-01 / Phase 2. The no-mode-field test (D-06) asserts on the *stored* shape, so the placeholder must already be mode-agnostic.
   - **RESOLVED:** minimal mode-agnostic `{ authCookieValue: string }` provisional, with a STORE-01 comment; finalized in Phase 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 22.15.0 | — |
| pnpm | repo workspace / CLAUDE.md local dev | ✓ | 9.3.0 | npm 10.9.2 present |
| npm registry access | installing deps + verification | ✓ | — | — |
| `@upstash/redis` (real instance) | STORE-03 *runtime* roundtrip | ✗ (by design) | — | **In-memory FakeUpstashRedis** for Phase 1; real instance exercised in Phase 5 preview (per PROJECT.md: Vitest cannot depend on a real KV instance) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** A real Upstash/KV instance is intentionally absent in Phase 1; the hand-rolled fake (D-15) is the fallback and is the *correct* approach for this phase, not a degraded one.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`). Security invariants STORE-04/05/06 map directly to negative-case tests.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | none yet — **Wave 0** creates `packages/core/vitest.config.ts` |
| Quick run command | `cd packages/core && pnpm test` (package `name: next-auth-bridge`; `pnpm --filter next-auth-bridge test` also resolves) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORE-01 | Stored entry has no mode-discriminating field | unit (contract) | `pnpm test -t "no mode field"` | ❌ Wave 0 |
| STORE-02 | In-memory adapter satisfies the interface, zero deps | unit (contract) | `pnpm test in-memory` | ❌ Wave 0 |
| STORE-03 | KV adapter satisfies same interface (against fake) | unit (contract) | `pnpm test kv` | ❌ Wave 0 |
| STORE-04 | Code is 64-char lowercase hex; high uniqueness across N | unit (negative/entropy) | `pnpm test -t "256-bit"` | ❌ Wave 0 |
| STORE-05 | Second consume returns null; concurrent consumes → exactly one wins | unit (negative) | `pnpm test -t "one-time-use"` | ❌ Wave 0 |
| STORE-06 | consume after clock advance past TTL returns null; `ttlSeconds>60` rejected | unit (negative) | `pnpm test -t "expiry"` | ❌ Wave 0 |

**Both adapters** run the same contract suite (D-15), so each row above is asserted twice (in-memory directly + KV against the fake).

#### What each security test should actually assert (provable vs structural)
- **STORE-04 entropy (provable in a unit test):** length === 64; charset `^[0-9a-f]+$`; uniqueness across N generations (e.g. 10k–100k, all distinct). *Verified empirically this session: 64 chars, hex, 100k all unique.* **Not provable in a unit test:** true randomness / bit-distribution quality — that's structural (guaranteed by using `crypto.randomBytes`, not by statistics). Assert the *contract* (length/charset/uniqueness) + rely on the single-site `crypto` call (D-01) for the entropy guarantee. A test asserting `generateCode` is the only code path is good belt-and-suspenders for D-06's "one answer" property.
- **STORE-05 one-time-use:** (1) `consume` twice → second is `null`; (2) concurrent `Promise.all([consume,consume])` → exactly one non-null payload, one `null`. Deterministic by construction (Pitfall 1) — no real concurrency, no flake.
- **STORE-06 TTL:** inject clock; `create`; advance clock by `ttlSeconds*1000 + 1`; `consume` → `null`. Plus a construction-time test: `ttlSeconds > 60` rejected (Pitfall 4). No real waits (D-14).

### Sampling Rate
- **Per task commit:** `cd packages/core && pnpm test` (the full Phase 1 suite is small and fast — run it all)
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/core/package.json` — name, exports map, deps (no test infra exists)
- [ ] `packages/core/tsconfig.json` — `strict: true`
- [ ] `packages/core/vitest.config.ts` — framework config
- [ ] `packages/core/tsup.config.ts` — two-entry build (verifies subpath resolves)
- [ ] `src/transfer-store/__tests__/contract.ts` — shared suite covering STORE-01/04/05/06
- [ ] `src/transfer-store/__tests__/fake-upstash-redis.ts` — clock-aware fake (D-15)
- [ ] Framework install: `pnpm add -D vitest typescript tsup @types/node` + `pnpm add @upstash/redis`
- [ ] pnpm workspace wiring (`pnpm-workspace.yaml`) if not present, so `pnpm test` resolves `packages/core`

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1`. This phase IS a security-primitive phase.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | indirect | This store backs the auth handoff; no auth logic here (Phase 2) |
| V3 Session Management | yes | One-time opaque handles, short TTL (≤60s), single-use — the store enforces handle lifecycle. `getdel` atomic invalidation. |
| V4 Access Control | no | No authz in the store |
| V5 Input Validation | partial | `consume(code)` takes an opaque string; the store never trusts it as anything but a key — no injection surface (HTTP key lookup) |
| V6 Cryptography | yes | `crypto.randomBytes(32)` — platform CSPRNG, **never hand-rolled** (D-01). 256-bit handle entropy. |
| V7 Errors & Logging | yes | D-13 error model: `null` (security miss) vs throw (operational) — and `null` carries no timing signal distinguishing miss modes (side-channel hardening, D-03) |

### Known Threat Patterns for this stack (THREAT-02 family)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Weak/guessable handle | Spoofing | 256-bit CSPRNG, single entropy site (STORE-04 / D-01) |
| Handle replay | Spoofing / Elevation | One-time-use; atomic `getdel` / Map-delete-first; second consume → null (STORE-05 / D-09) |
| Stale handle reuse | Elevation | TTL ≤ 60s; native `EX` / lazy `expiresAt`; clamp at construction (STORE-06 / D-07) |
| TOCTOU race on consume | Elevation | Delete-first-then-validate atomic primitive (D-09) — no get-then-del window |
| Miss-mode timing oracle | Information Disclosure | All miss modes collapse to `null`; no per-mode timing branch (D-03) |

> Test files should reference the **THREAT-02** invariant in comments (per CONTEXT.md canonical refs) so Phase 4's HARDEN-01 threat-model mapping is traceable. `docs/threat-model.md` does not exist yet — it's authored in Phase 4.

## Project Constraints (from CLAUDE.md)

- **TypeScript `strict: true`; no `any` outside test scaffolding.** Adapters and interface must be fully typed; `TransferPayload` concrete (D-04). Test scaffolding (the fake) may relax to `unknown`/casts.
- **Vitest with explicit negative cases** for each helper — entropy, one-time-use, TTL expiry are the negative cases for this phase.
- **MIT license header in new files under `packages/`** — every new `.ts` file under `packages/core/` gets the header.
- **Conventional Commits**, atomic, one logical change per commit. No emoji in code/commits. Prettier + ESLint `@typescript-eslint/recommended`.
- **Threat-model discipline:** changes touching transferStore behavior require a threat-model update + negative-case test. `threat-model.md` doesn't exist yet → Phase 1 ships the negative-case *tests* and references THREAT-02 in comments; Phase 4 writes the doc. The tests this phase produces ARE the threat-model coverage for STORE-04/05/06.
- **No pre-existing code** — Phase 1 establishes `packages/core` from scratch (greenfield).

## Sources

### Primary (HIGH confidence)
- `npm view @upstash/redis version | deprecated | time` — `1.38.0`, published 2026-06-05; `@vercel/kv@3.0.0` deprecation message confirmed (run this session)
- github.com/upstash/redis-js `packages/redis/platforms/nodejs.ts` (via `gh api`) — `fromEnv()` reads `UPSTASH_REDIS_REST_URL`||`KV_REST_API_URL`, `UPSTASH_REDIS_REST_TOKEN`||`KV_REST_API_TOKEN` (verified source)
- upstash.com/docs/redis/sdks/ts — `set(key, value, { ex })` option name and signature; auto-serialization note
- upstash.com/docs/redis/sdks/ts/commands/string/getdel — `getdel<T>(key): Promise<T | null>`, atomic read+delete, typed return
- Node `crypto` empirical verification (run this session): `randomBytes(32).toString('hex')` → 64 chars, hex charset, 100k all unique
- slopcheck 0.6.1 run (this session): `@upstash/redis`/`tsup`/`typescript` [OK]; `vitest` [SUS] false-positive (close-to-`vite` heuristic)
- CLAUDE.md / CONTEXT.md / REQUIREMENTS.md / ROADMAP.md / PROJECT.md (project authority)

### Secondary (MEDIUM confidence)
- WebSearch: `automaticDeserialization: false` option to disable SDK JSON (de)serialization (corroborated by Upstash advanced docs + GitHub issue #49)
- npm download counts via api.npmjs.org (3.59M/wk @upstash/redis, 6.13M/wk tsup)

### Tertiary (LOW confidence)
- WebSearch on Upstash test doubles — confirmed *absence* of an official @upstash/redis mock; `ioredis-mock` exists but targets the ioredis API (wrong surface). Used to justify hand-rolling.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions registry-verified this session; `@upstash/redis` API confirmed against official docs + GitHub source
- Architecture: HIGH — patterns derive directly from locked decisions + verified SDK primitives
- Pitfalls: HIGH — serialization/clock/concurrency pitfalls grounded in verified SDK behavior and Node event-loop semantics
- Test double recommendation: MEDIUM-HIGH — absence of official mock confirmed; hand-roll is small and well-scoped

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable; `@upstash/redis` minor versions may bump but `set({ex})`/`getdel` are stable primitives — recheck deprecation status of any client before Phase 5)
