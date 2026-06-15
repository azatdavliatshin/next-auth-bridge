# Phase 1: TransferStore & Adapters - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a **mode-agnostic `TransferStore` interface** with two working backends — an in-memory adapter for the Vitest test bench and a Vercel-serverless (Upstash Redis) adapter for cross-invocation state — and proves the security invariants directly against the store: 256-bit CSPRNG entropy (STORE-04), atomic one-time-use deletion (STORE-05), and TTL ≤ 60s expiry (STORE-06).

Covers requirements **STORE-01 through STORE-06**. No routes, client surfaces, or HTTP handlers — those are Phase 2+. The interface designed here **freezes verbatim into v0.2** (the highest-leverage decision in the project), so every shape choice is made to survive the addition of Mode B's native-callback handles without a breaking change.

</domain>

<decisions>
## Implementation Decisions

### Interface Shape & Signatures
- **D-01:** The **store generates the code** — `create(payload: TransferPayload): Promise<{ code: string }>`; the 256-bit CSPRNG (`crypto.randomBytes(32).toString('hex')`) lives in exactly one place. STORE-04 entropy is guaranteed by construction; no callsite can supply a weak code. Auditability: "where does entropy come from?" has one answer. (Rejected caller-supplied entropy — distributes CSPRNG responsibility; one `Math.random()` slip would be a silent regression no test catches. The bridge route is not the only future caller — Mode B's native handler will be another.)
- **D-02:** `create()` returns an **object** (`Promise<{ code: string }>`), never a bare `Promise<string>`. Object-wrapping costs nothing at runtime but leaves room for additive fields in v0.2+ (`expiresAt`, `attemptCount`, telemetry) without breaking consumers. (Rejected a richer handle with `expiresAt` now — speculative; Phase 2's `/auth/bridge` returns `{ code }` to a popup client that immediately consumes it, and Phase 3's client never needs the deadline.)
- **D-03:** `consume(code: string): Promise<TransferPayload | null>` — returns `null` on miss. The three miss modes (not-found / expired / already-consumed) **all collapse to `null`** at the call boundary; the bridge's response to all three is identical (4xx, restart flow). Keeps negative tests clean ("second consume returns null") and avoids leaking timing information about which failure occurred.
- **D-04:** `TransferPayload` is a **fixed concrete package-defined type**, mode-agnostic by construction. Phase 2 fills in the exact fields (the auth-cookie value/name needed to reconstitute the session). Not generic-over-`T`, not an opaque blob.
- **D-05:** **Each adapter owns serialization.** The interface deals in the typed `TransferPayload` object; in-memory holds the object directly, the KV adapter JSON-stringifies on write / parses on read.
- **D-06:** STORE-01 "no mode-discriminating fields" is enforced by **a test asserting the stored shape carries no mode field**, plus a comment on the `TransferPayload` type citing STORE-01 / the v0.2 forward-compat constraint. A future discriminator addition fails the test and is visible in review.

**Locked interface:**
```ts
interface TransferStore {
  create(payload: TransferPayload): Promise<{ code: string }>;
  consume(code: string): Promise<TransferPayload | null>;
}
```

### TTL Semantics & Ownership
- **D-07:** TTL is configured **per-store at construction** (e.g. `new InMemoryStore({ ttlSeconds: 60 })`), default 60s, **clamped/rejected if > 60s**. `create()` takes no TTL argument. STORE-06's ≤60s cap is enforced once, at construction.
- **D-08:** Expiry enforcement: **KV uses native TTL** (set key with `EX`/expiry so the backend evicts); **in-memory stores an `expiresAt` timestamp and checks it lazily on `consume()`** (expired → delete + return `null`). No background timers or sweeps — deterministic for tests.
- **D-09:** `consume()` is **atomic read-and-delete, then validate**. It atomically removes the entry first (KV: `GETDEL`/pipeline; in-memory: delete + return prior value), *then* checks expiry on the removed value. Guarantees a code is gone after exactly one consume even if expired — closes the replay/TOCTOU race for STORE-05 under concurrency. Returns `null` if absent or expired.

### Adapter Packaging & Dependencies
- **D-10:** The production ("Vercel KV") adapter is **built on `@upstash/redis`** while keeping the "Vercel KV" framing. *(Research finding — see Canonical References: `@vercel/kv` was deprecated Dec 2024; Vercel KV stores migrated to Upstash Redis; new projects use `@upstash/redis` via the Marketplace. `@upstash/redis` supports native `EX` TTL and `GETDEL`, matching D-08/D-09.)* Satisfies STORE-03's intent (cross-invocation state on Vercel) with the non-deprecated client.
- **D-11:** **Packaging: subpath export + optional peer dependency.** Core + in-memory live at the main entry; the KV adapter lives at `next-auth-bridge/store/kv` and imports `@upstash/redis`, declared as an **optional `peerDependency`**. The test bench and threat-model tests import only the main entry and never pull in `@upstash/redis`. Clean tree-shaking and dependency isolation.
- **D-12:** **Minimal viable package skeleton.** Phase 1 establishes `packages/core` with a strict `tsconfig`, Vitest, a `package.json` exports map (main + `./store/kv` subpath), and a build step — just enough to compile, test, and resolve the subpath. Full publish config (files/npmignore, dual ESM+CJS, etc.) is deferred to Phase 6 (RELEASE-*).

### Error Model & Test Surface
- **D-13:** **Throw on operational failure, `null` on miss.** `null` is reserved strictly for the security-meaningful miss path (not-found / expired / already-consumed → bridge 4xx). Genuine operational failures (KV unreachable, write failure, deserialization error) **throw** → bridge 5xx / retry. This distinguishes "attacker/expired" from "our backend broke" and keeps the security semantics of `null` clean.
- **D-14:** **Injectable clock seam.** The store accepts an optional `now()` / clock in its constructor (defaults to `Date.now`). TTL/expiry negative tests inject a controllable clock and advance it past the TTL — real, explicit, adapter-agnostic, no global timer mocking, no real waits.
- **D-15:** **Shared contract suite + fake Redis.** One `TransferStore` contract test suite (entropy, one-time-use, expiry, atomicity, error model) runs against **both** adapters — in-memory directly, KV against an in-memory fake of the Upstash client. Proves both satisfy identical semantics. The real-Upstash roundtrip is exercised later by the Phase 5 Vercel preview, not in Phase 1 (per the PROJECT.md constraint that Vitest cannot depend on a real KV instance).

### Claude's Discretion
- Exact build tool (`tsup` / `tsc` / other) for the `packages/core` skeleton — left to research/planning.
- Exact KV primitive for the atomic read-and-delete (`GETDEL` vs Lua vs pipeline) — the invariant (one consume ⇒ gone, atomically) is locked; the mechanism is an implementation choice for the planner/researcher.
- The specific in-memory Upstash-client fake (hand-rolled vs an existing `@upstash/redis` test double) — locked that one shared contract suite must run against both adapters; the test-double mechanism is open.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project planning & requirements
- `.planning/PROJECT.md` — Core Value (Mode A deeply correct), v0.1.0 scope, Key Decisions table (incl. "transferStore v1 = in-memory + Vercel KV").
- `.planning/REQUIREMENTS.md` — STORE-01..06 full text; the THREAT-NN namespace note; forward-compat constraint on STORE-01.
- `.planning/ROADMAP.md` §"Phase 1: TransferStore & Adapters" — goal and the five success criteria this phase must make TRUE.
- `CLAUDE.md` — package conventions: TypeScript `strict: true` / no `any` outside test scaffolding, Vitest with explicit negative cases, Conventional Commits, MIT license header in `packages/` files, threat-model discipline.

### External research (captured during discussion)
- Vercel Redis / KV deprecation — `@vercel/kv` deprecated Dec 2024; KV migrated to Upstash Redis; new projects use `@upstash/redis` via Marketplace. Refs: https://vercel.com/docs/redis , https://vercel.com/marketplace/upstash , https://community.vercel.com/t/switching-from-vercel-kv-to-upstash-kv-questions/2660 — grounds D-10. Researcher should confirm current `@upstash/redis` API for `set ... { ex }` and `getdel`.

### To be authored in/after this phase
- `docs/threat-model.md` — does not yet exist (greenfield). Phase 1 produces the negative-case tests for STORE-04/05/06; HARDEN-01 (Phase 4) writes the canonical threat-model doc. Phase 1 test files should reference the THREAT-02 invariant (entropy / one-time-use / TTL) in comments so the Phase 4 mapping is traceable.

*(No pre-existing source code or `docs/` directory — this is the first code-bearing phase in the repo.)*

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None — greenfield.** No `packages/`, `package.json`, `tsconfig`, or `docs/` exist yet. Repo currently holds only `.planning/`, `CLAUDE.md`, `README.md`, `LICENSE`, and `.githooks/`. Phase 1 establishes the `packages/core` skeleton from scratch.

### Established Patterns
- **CLAUDE.md architecture pointers** name the intended layout: `packages/core/src/transfer-store/` is the designated home for the "pluggable adapter interface + concrete implementations (Vercel KV, Upstash, in-memory)". Follow this path.
- Node `crypto` (`randomBytes`) is the entropy source — standard library, no dependency.

### Integration Points
- The `TransferStore` interface is the seam **Phase 2** builds on: `/auth/bridge` calls `create()` to mint a handle; `/auth/consume` calls `consume()` to exchange it. The `TransferPayload` fields are defined here as a placeholder type and finalized in Phase 2.
- The subpath export (`next-auth-bridge/store/kv`) and the main entry's `exports` map established here are the package's public surface that Phase 6 (RELEASE-*) will publish.

</code_context>

<specifics>
## Specific Ideas

- The user wants `create()`'s **object return type locked from day one** specifically so v0.2 can add `expiresAt` additively — "going from `{ code }` to `{ code, expiresAt }` is purely additive; going from `Promise<string>` to `Promise<{ code }>` later would break every consumer."
- The user explicitly wants the threat-model story to read as **"the transferStore generates 256-bit codes; the interface makes weaker codes impossible"** — an invariant guaranteed by construction, not by trusting callsites.
- The user wants `null` to carry **no timing signal** about which miss mode occurred (minor side-channel hardening), reinforcing D-03/D-13.

</specifics>

<deferred>
## Deferred Ideas

- **PROJECT.md / REQUIREMENTS.md wording update (documentation follow-up, not scope creep):** Building the production adapter on `@upstash/redis` (D-10) partially collapses the v0.2 "Upstash adapter" deferral (STORE-07 / Out of Scope). PROJECT.md's Key Decision ("transferStore v1 = in-memory + Vercel KV (Upstash deferred)") and REQUIREMENTS.md STORE-03's "Vercel KV adapter" wording should be reconciled to state that the Vercel production adapter *is* the Upstash-Redis client. Recommend handling at the phase transition (`/gsd-transition`) or a small docs commit — not blocking Phase 1 engineering.
- **`expiresAt` / `attemptCount` / telemetry fields on the create() return** — intentionally left out of v1 (D-02); the object return type reserves space to add them additively when a real consumer surfaces (v0.2 / Mode B).

</deferred>

---

*Phase: 1-TransferStore & Adapters*
*Context gathered: 2026-06-05*
