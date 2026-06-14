# next-auth-bridge — Project context

## What this project is

A Next.js / Auth.js npm package implementing cross-context authentication for two transports:

- **Mode A (popup-based):** for Next.js apps embedded in enterprise iframes (SharePoint, Teams Tab, Salesforce Lightning, ServiceNow, Confluence/Jira). Uses CHIPS partitioned cookies for cross-context handoff. The popup runs in top-level browser context and silent-auths via the host's existing identity-provider session.
- **Mode B (pwa-shell-based):** for Next.js apps wrapped as native iOS apps via PWABuilder's iOS template. Uses `ASWebAuthenticationSession` with `prefersEphemeralWebBrowserSession = false` to surface iCloud Keychain → unlocks passkeys, autofill, Sign in with Apple inside the wrapper.

One shared `transferStore` with one-time-use 256-bit hex codes backs both transports.

## Technical references

- [Auth.js](https://authjs.dev/) — peer dependency
- [RFC 8252 — OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) — the architectural pattern for Mode B
- [ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession) — Apple API used by Mode B
- [CHIPS — Partitioned cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies) — cookie partitioning spec used by Mode A
- [PWABuilder iOS template](https://github.com/pwa-builder/pwabuilder-ios) — canonical iOS wrapper this package targets (forked from [khmyznikov/ios-pwa-wrap](https://github.com/khmyznikov/ios-pwa-wrap))

## Development workflow

Two long-lived branches:

- **`main`** — the published surface. Tagged releases come from here. Modified only through pull requests; direct pushes are blocked by branch protection.
- **`dev`** — the active engineering branch. Day-to-day work lands here, including work-in-progress notes, milestone planning, exploratory code, and unresolved decisions.

When a chunk of work is ready, a clean PR branch is generated from `dev` (with internal planning artifacts filtered out — `/gsd-pr-branch`) and opened against `main`. PRs are **rebase-merged** (the `main` ruleset requires linear history; rebasing keeps `dev`'s real commits on `main` so `main..dev` stays just the new work and the clean-branch step never has to replay history). The full loop, flags, and release/recovery gotchas are in [docs/dev-workflow.md](docs/dev-workflow.md).

External contributors: fork the repo, branch from `main`, open PR against `main`. No need to engage with `dev`.

### Versioning and releases

Releases use [semantic-release](https://github.com/semantic-release/semantic-release) driven by [Conventional Commits](https://www.conventionalcommits.org/). Each merge to `main` triggers, via CI:

1. Next semantic version determined from commit types since last release (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` in commit body → major).
2. Tag created (e.g., `v0.1.0`).
3. npm package published as `next-auth-bridge`.
4. GitHub Release published with auto-generated `CHANGELOG.md` entry.

Commits should use Conventional Commit types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`. Use the `BREAKING CHANGE:` footer for major bumps.

A commit-msg hook validates that every commit message conforms to the Conventional Commits format. Malformed messages are rejected locally before push, so PRs always arrive with a clean history that semantic-release can parse without manual cleanup.

Milestones (independent of releases) are tracked in `MILESTONES.md` on the `dev` branch — human-readable history of phase boundaries, not git tags.

## Style and conventions

- **Language:** TypeScript with `strict: true`. No `any` outside test scaffolding.
- **Functional style — no classes.** Stores, services, and adapters are factory functions returning closures (e.g. `createInMemoryTransferStore(opts): TransferStore`), not `class … implements`. State is captured in the closure, not on `this`. This is pragmatic FP — `Map`, `async/await`, and local mutation inside a closure are fine; the goal is no `class`/`new`/`this`/inheritance in the public surface, not purity. (A one-time-use store is inherently stateful; full purity is not a goal.)
- **Testing:** Vitest. Each route handler and helper has tests including explicit security/negative cases (forged detection signals, replay attempts, malformed `next` redirects).
- **Commits:** Conventional Commits (see above). Atomic — one logical change per commit.
- **Formatting:** Prettier default; ESLint with `@typescript-eslint/recommended`.
- **No emoji in code or commit messages.** OK in README headings.
- **License:** MIT, declared once via the root `LICENSE` file and `package.json` `"license": "MIT"`. Do NOT add per-file SPDX or copyright headers — the root declaration covers the whole package.

## Architecture pointers

- `packages/core/src/` — package source
  - `middleware.ts` — wrapper / iframe detection + redirect routing
  - `bridge-route.ts` — `/auth/bridge` handler (both `?popup=true` and PWA modes)
  - `consume-route.ts` — `/auth/consume` handler (sets partitioned cookie for popup mode, regular cookie for PWA mode)
  - `popup-page.tsx` — `/auth/popup` client component
  - `native-signin-page.tsx` — `/auth/native-signin` client component
  - `auth-helpers.ts` — `getAuthCookieName`, `sanitizeNext`, etc.
  - `transfer-store/` — pluggable adapter interface + concrete implementations (Vercel KV, Upstash, in-memory)
- `examples/nextjs-app-router-multi-tenant/` — end-to-end reference app showing all three contexts (web, iframe-embedded, wrapped-PWA) under one codebase + dynamic per-tenant PWA manifest + public install-pwa landing page
- `examples/nextjs-app-router-minimal/` — popup-only minimal example for Teams Tab / SharePoint iframe scenarios without PWA wrapping

## Threat model discipline

`docs/threat-model.md` enumerates the security properties of the bridge. **Any change touching the bridge / consume routes, transferStore behavior, cookie attribute setting, or wrapper-detection logic requires a corresponding update to threat-model.md** and a test for the relevant negative case. Enforced at PR review.

Quick summary of the most security-critical invariants (full text in threat-model.md):

1. Codes are 256-bit CSPRNG, one-time-use, deleted on first read, TTL ≤ 60 s.
2. No session token in URL — only opaque handle.
3. PKCE preserved through the bridge handoff (Auth.js handles).
4. Wrapper detection is UX routing, not a security boundary. `/auth/bridge` independently checks for an actual session before minting a handle.
5. `postMessage` origin checks on both ends.
6. `partitioned: true` on cookie in popup mode (CHIPS-compliant).
7. `sanitizeNext` rejects redirect targets inside `/auth`, `/api/auth`.

## Local development

```bash

# Install

pnpm install

# Test

pnpm test
pnpm test:watch

# Lint + format

pnpm lint
pnpm format

# Run reference example app

cd examples/nextjs-app-router-multi-tenant && pnpm dev
```

## Pre-commit hook

The repo includes a pre-commit hook at `.githooks/pre-commit`. To activate once per clone:

```bash
git config core.hooksPath .githooks
```

The hook is a no-op by default. To enable pattern-matching, create a local-only patterns file (not tracked by git):

```bash
touch .git/local-patterns.txt
echo "your-pattern-here" >> .git/local-patterns.txt
```

Each line in `.git/local-patterns.txt` is a case-insensitive regex. The hook checks staged additions against the patterns and aborts the commit if any match.

## When extending the project

- Read `docs/threat-model.md` at session start (the invariant registry).
- For non-trivial features: open an issue or draft a `dev`-branch design note before coding. Substantive engineering decisions are documented in PR descriptions or in `docs/`.
- For implementing: branch from `dev` (maintainer) or `main` (external contributor). Commit using Conventional Commits.
- For PR: rebase-merge into target branch (linear-history ruleset). CHANGELOG generation is automated. See [docs/dev-workflow.md](docs/dev-workflow.md).
- Ad-hoc edits OK for typos, doc-only changes, and small bug fixes.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**next-auth-bridge**

A Next.js / Auth.js npm package (`next-auth-bridge`) that solves cross-context authentication for two recurring deployment shapes: Next.js apps embedded as iframes inside enterprise hosts (SharePoint, Teams Tab, Salesforce Lightning, ServiceNow) that already have an active OIDC session, and Next.js apps wrapped as native iOS via PWABuilder's pwa-shell template. Both share one architectural shape — a server-side handle store mediating one-time-code exchange across a trust boundary — exposed as a clean, pluggable package for the Auth.js + Next.js ecosystem.

It is library-first. The reference example apps in this repo are the only deterministic consumers at v0.1.0; real external adoption is a hypothesis tested post-publish through community channels and an Auth.js docs recipe.

**Core Value:** The popup-bridge (Mode A) pattern works end-to-end and is *deeply correct* — every threat-model invariant holds under negative-case test coverage. Correctness of the security-critical handoff is the one thing that cannot fail; breadth of transports and hosts is secondary.

GSD planning lives in `.planning/` (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, config.json) **on the `dev` branch only** — it is internal tooling state, never merged to `main` (the published surface carries only product: code, `docs/`, README, license). Stack, conventions, and architecture for this project are documented in the hand-authored sections above and in `docs/`.

<!-- GSD:project-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
