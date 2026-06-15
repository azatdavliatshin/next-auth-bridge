# Phase 6: Release Engineering - Pattern Map

**Mapped:** 2026-06-12
**Files analyzed:** 9 (5 new, 4 modified)
**Analogs found:** 6 / 9 (3 net-new with no in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.githooks/commit-msg` (NEW) | git hook (bash) | transform/validate | `.githooks/pre-commit` | exact (same role, same bash/no-dep style) |
| `.github/workflows/release.yml` (NEW) | CI workflow | event-driven (push→main) | `.github/workflows/keycloak-agnosticism.yml` | role-match (workflow conventions; different job purpose) |
| `.github/workflows/pr-title.yml` (NEW) | CI workflow | event-driven (PR) | `.github/workflows/keycloak-agnosticism.yml` | role-match |
| `packages/core/tsdown.config.ts` (NEW, replaces tsup) | build config | transform | `packages/core/tsup.config.ts` | exact (direct migration source) |
| `packages/core/src/__tests__/commit-msg.test.ts` (NEW) | test | request-response (drives hook subprocess) | `packages/core/src/__tests__/auth-helpers.test.ts` | role-match (Vitest unit shape; new subprocess driver) |
| `packages/core/package.json` (MODIFIED) | package manifest | config | (self — current state below) | self |
| `package.json` (root, MODIFIED) | workspace manifest | config | (self — current state below) | self |
| `.releaserc.json` (NEW) | release config | config | — | NO ANALOG → RESEARCH.md Pattern 1 |
| authjs.dev recipe `<slug>.mdx` + `_meta.js` (NEW, external repo) | docs | static | — | NO ANALOG → RESEARCH.md "Code Examples: Auth.js docs recipe" |

**Important correction vs RESEARCH.md:** the repo's Vitest tests live in `packages/core/src/__tests__/`, NOT `tests/`. The new hook test should be `packages/core/src/__tests__/commit-msg.test.ts` to match the existing layout (RESEARCH.md's `tests/commit-msg.test.ts` path is wrong for this repo).

---

## Pattern Assignments

### `.githooks/commit-msg` (git hook, validate)

**Analog:** `.githooks/pre-commit` (the only existing hook — exact style match)

**Header / shebang / activation-doc pattern** (`.githooks/pre-commit` lines 1-18) — mirror this comment block style; document the same `core.hooksPath` activation, no third-party deps:
```bash
#!/usr/bin/env bash
#
# <one-line purpose>
#
# <explanation>
#
# To activate this hook directory once per clone:
#   git config core.hooksPath .githooks

set -uo pipefail
```

**Key conventions to carry over:**
- `set -uo pipefail` (line 18) — same strictness flags (note: not `-e`, the pre-commit uses `-uo`).
- Pure-bash, zero runtime devDeps (D-04). No husky, no node.
- Self-documenting comment block, NO `RELEASE-NN`/`D-NN` markers (Phase 5 discreet mandate — the existing pre-commit has none).
- Exit `0` on pass, `exit 1` with a human-readable echo block on reject (lines 44-54 show the multi-line `echo` rejection style to mirror).

**Hook body to implement** (from RESEARCH.md Pattern 4 — net-new logic, no in-repo regex analog): `head -1 "$1"` to get subject; passthrough `Merge*|Revert*|fixup!*|squash!*`; `grep -Eq` the Conventional-Commits regex covering `feat|fix|docs|refactor|test|chore|build|ci|perf|style` + optional `(scope)` + optional `!`.

---

### `packages/core/tsdown.config.ts` (build config, transform)

**Analog:** `packages/core/tsup.config.ts` (direct migration source — D-06)

**Full current tsup config** (entire file, lines 12-22) — the shape maps 1:1 onto tsdown:
```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "store/kv": "src/transfer-store/kv.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
});
```

**Migration notes:**
- Swap `from "tsup"` → `from "tsdown"`; keep `defineConfig`, both entries, `format: ["esm"]`, `dts: true`, `clean: true` (RESEARCH.md Code Examples confirms these are tsdown defaults/compatible).
- Preserve BOTH entries exactly — `index` and `store/kv` — the `./store/kv` subpath in `package.json` exports resolves against `dist/store/kv.{js,d.ts}` (D-02 gate verifies this emit).
- The existing header comment (lines 1-10) references "deferred to Phase 6 (RELEASE-*)" and "D-12" — STRIP these internal markers in the new file per the discreet mandate; write a clean self-documenting header instead.
- Tooling: run `npx tsdown-migrate --dry-run` then apply (RESEARCH.md), verify dist-parity against known-good tsup output.

---

### `.github/workflows/release.yml` (CI workflow, event-driven)

**Analog:** `.github/workflows/keycloak-agnosticism.yml` (repo's only workflow — step conventions)

**pnpm + Node + install + build step sequence** (keycloak workflow lines 101-117) — reuse this exact step idiom:
```yaml
      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build package
        run: pnpm --filter next-auth-bridge build
```

**Carry over:** `runs-on: ubuntu-latest`, `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4` with `cache: pnpm`, `pnpm install --frozen-lockfile`, `pnpm --filter next-auth-bridge build`.

**DIVERGE from analog (RESEARCH.md Pattern 2 governs these):**
- `node-version: 22` (NOT 20 — semantic-release 25 + tsdown 0.22 need ≥22 as a tooling floor). This is the one place to override the analog's `node-version: 20`.
- Add `registry-url: https://registry.npmjs.org` to setup-node, `fetch-depth: 0` on checkout (full history for version derivation).
- Add top-level `permissions:` block with `contents: write`, `issues: write`, `pull-requests: write`, `id-token: write` (provenance — D-03).
- Trigger: `on: push: branches: [main]` (analog uses `[main, dev]` + `pull_request` — narrow to `main` only).
- Final step `pnpm exec semantic-release` with `GITHUB_TOKEN`, `NPM_TOKEN`, `NPM_CONFIG_PROVENANCE: "true"` env.

---

### `.github/workflows/pr-title.yml` (CI workflow, event-driven)

**Analog:** `.github/workflows/keycloak-agnosticism.yml` (workflow skeleton: `name`, `on`, `jobs.<id>.runs-on: ubuntu-latest`, `steps:` shape, lines 1-2, 14-17, 51-53).

**Body is net-new** (RESEARCH.md Pattern 3): `on: pull_request_target: types: [opened, edited, synchronize]`, `permissions: pull-requests: read`, single step `uses: amannn/action-semantic-pull-request@v6` (pin `@v6` or full SHA) with the 10 Conventional-Commit types in `with.types`. Use `pull_request_target` NOT `pull_request` (Pitfall 5). Reads title only — never checks out PR code.

---

### `packages/core/src/__tests__/commit-msg.test.ts` (test, drives hook)

**Analog:** `packages/core/src/__tests__/auth-helpers.test.ts` (Vitest unit-test shape; existing negative-case discipline)

**Import + describe/it structure** (auth-helpers.test.ts lines 17, 21-23) — mirror:
```typescript
import { describe, expect, it } from "vitest";
// ... import target ...

describe("<unit> (<requirement framing>)", () => {
  it("passes a safe ... case", () => {
    expect(...).toBe(...);
  });
```

**Carry over conventions:**
- `import { describe, expect, it } from "vitest";` (line 17).
- Grouped `describe` per behavior, explicit positive AND negative `it` cases (the file's whole structure is positive-pass + negative-reject pairs — matches CLAUDE.md "explicit security/negative cases").
- Test scaffolding may relax types per CLAUDE.md (line 15 note) — fine to cast subprocess results.
- NO `RELEASE-NN`/`D-NN` in any committed source; this test FILE may carry threat/requirement framing in comments like the analog does (`THREAT-08`/`ROUTE-06` appear in this test) — BUT note: the discreet mandate forbids internal IDs in *shipped* source. Tests are not in the `files: ["dist"]` tarball, so they don't ship; however to stay consistent with the Phase 5 mandate, prefer self-documenting comments without `RELEASE-NN`/`D-NN` markers.

**Body is net-new** (no existing test spawns a subprocess): use `node:child_process` `execFileSync`/`spawnSync` to run `.githooks/commit-msg` against temp message files with sample subjects (valid types, malformed, `Merge`/`Revert` passthrough). Assert exit code 0 (accept) vs non-zero (reject). No existing analog in `__tests__/` uses child_process (verified).

---

### `packages/core/package.json` (MODIFIED — add publish metadata)

**Current state** (the file being modified — full current content, lines 1-36):
- Has: `name`, `version: 0.1.0`, `description`, `license: MIT`, `type: module`, the `exports` map (`.` + `./store/kv`), `scripts.test`, `scripts.build: "tsup"`, peer dep `@upstash/redis` (optional), devDeps incl. `tsup`.
- **Missing (D-03 adds):** `files`, `publishConfig`, `engines`, `repository`, `homepage`, `bugs`, `keywords`.

**Edits required:**
- `scripts.build`: `"tsup"` → `"tsdown"` (line 19).
- `devDependencies`: remove `"tsup": "^8.5.1"` (line 33), add `"tsdown"`.
- Add the D-03 metadata block (RESEARCH.md "Publish-metadata additions" example): `files: ["dist"]`, `publishConfig: { access: "public", provenance: true }`, `engines: { node: ">=18" }` (consumer floor — NOT the tooling ≥22), `repository`/`homepage`/`bugs` → `github.com/azatdavliatshin/next-auth-bridge`, `keywords` array.
- Preserve the existing `exports` map EXACTLY — provenance + subpath resolution depend on it.

---

### `package.json` (root, MODIFIED)

**Current state** (full file, lines 1-6): empty manifest with only `dependencies: { semantic-release, tsdown }` — note tsdown is also pinned `^0.21.10` here (stale vs the 0.22.2 target; reconcile at implementation time).

**Edits required (RESEARCH.md Runtime State Inventory):**
- Move `semantic-release` (and the semantic-release plugins) from `dependencies` → `devDependencies` (they are dev/CI tooling, never runtime).
- `tsdown` belongs in `packages/core` devDeps, not root deps — remove from root or relocate.
- Optionally add workspace-root release scripts (Claude's discretion, D-03 / Open Question 2).

---

## Shared Patterns

### No internal requirement IDs in shipped/committed source
**Source convention:** `.githooks/pre-commit` (clean self-documenting comments, zero `RELEASE-NN`/`D-NN`/`THREAT-NN` markers) and the Phase 5 discreet mandate.
**Apply to:** ALL files in this phase — hooks, workflows, `tsdown.config.ts`, `.releaserc.json`, `package.json` comments, the authjs.dev recipe MDX. The existing `tsup.config.ts` header DOES contain `D-12`/`RELEASE-*` markers — these MUST be stripped when creating `tsdown.config.ts`.

### Lean, no-dependency hook style
**Source:** `.githooks/pre-commit` lines 18-56 — pure bash, `set -uo pipefail`, file-existence guards, `grep -E`, human-readable `echo` blocks on failure.
**Apply to:** `.githooks/commit-msg` (D-04 — no husky/commitlint).

### GitHub Actions step idiom
**Source:** `.github/workflows/keycloak-agnosticism.yml` lines 101-117.
**Apply to:** both new workflows — `checkout@v4`, `pnpm/action-setup@v4`, `setup-node@v4` (`cache: pnpm`), `pnpm install --frozen-lockfile`. The ONE deliberate divergence is `node-version: 22` (not the analog's 20) for the release/tooling job.

### Vitest negative-case discipline
**Source:** `auth-helpers.test.ts` (positive + explicit negative cases per behavior).
**Apply to:** `commit-msg.test.ts` — pair every accept case with a reject case (CLAUDE.md testing convention).

---

## No Analog Found

Files with no close in-repo match (planner uses RESEARCH.md patterns):

| File | Role | Reason | Use Instead |
|------|------|--------|-------------|
| `.releaserc.json` | release config | No existing semantic-release config in repo | RESEARCH.md Pattern 1 (six-plugin chain, `pkgRoot: "packages/core"`) |
| authjs.dev `<slug>.mdx` + `_meta.js` | external docs | Lives in `nextauthjs/next-auth`, not this repo; no MDX recipes here | RESEARCH.md "Auth.js docs recipe PR" — model on sibling guides `integrating-third-party-backends.mdx`, `corporate-proxy.mdx` |
| `commit-msg.test.ts` body (subprocess driver) | test logic | No existing test spawns a child process (verified) | RESEARCH.md Pattern 4 hook contract + `node:child_process` |

## Metadata

**Analog search scope:** `.githooks/`, `.github/workflows/`, `packages/core/` (src, tsup.config, package.json), root `package.json`, `pnpm-workspace.yaml`, `packages/core/src/__tests__/`
**Files scanned:** 7 read in full + 2 directory listings
**Pattern extraction date:** 2026-06-12
