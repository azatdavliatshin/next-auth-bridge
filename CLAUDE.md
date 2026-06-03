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

On milestone completion, a clean PR branch is generated from `dev` (with internal planning artifacts filtered out) and opened against `main`. PRs are squash-merged. The maintainer's local tooling automates this filtering step.

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
- **Testing:** Vitest. Each route handler and helper has tests including explicit security/negative cases (forged detection signals, replay attempts, malformed `next` redirects).
- **Commits:** Conventional Commits (see above). Atomic — one logical change per commit.
- **Formatting:** Prettier default; ESLint with `@typescript-eslint/recommended`.
- **No emoji in code or commit messages.** OK in README headings.
- **License:** MIT. Include a license header in new files under `packages/`.

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

- Read `docs/architecture.md` and `docs/threat-model.md` at session start.
- For non-trivial features: open an issue or draft a `dev`-branch design note before coding. Substantive engineering decisions are documented in PR descriptions or in `docs/`.
- For implementing: branch from `dev` (maintainer) or `main` (external contributor). Commit using Conventional Commits.
- For PR: squash-merge into target branch. CHANGELOG generation is automated.
- Ad-hoc edits OK for typos, doc-only changes, and small bug fixes.
