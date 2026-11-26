# Contributing to next-auth-bridge

## Development workflow

Trunk-based (GitHub Flow). There is one long-lived branch:

- **`main`** — the trunk and the release surface. Tagged releases come from here. It changes only through pull requests; direct pushes are blocked by branch protection.

Everyone, maintainer and external contributor alike, works the same way: branch a short-lived `feat/…` / `fix/…` / `chore/…` branch off `main`, commit using Conventional Commits, and open a PR against `main`. PRs are **rebase-merged**: the `main` ruleset requires linear history, and rebasing keeps each Conventional Commit subject intact so semantic-release can parse it. The full loop and the release and recovery gotchas are in [docs/dev-workflow.md](docs/dev-workflow.md).

There is no `dev` branch. Substantive engineering decisions are recorded in PR descriptions and in `docs/`.

## Versioning and releases

Releases use [semantic-release](https://github.com/semantic-release/semantic-release) driven by [Conventional Commits](https://www.conventionalcommits.org/). Each merge to `main` triggers, via CI:

1. The next semantic version, determined from the commit types since the last release (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` in the commit body → major).
2. A tag (for example `v0.1.0`).
3. An npm publish of `next-auth-bridge`.
4. A GitHub Release with an auto-generated `CHANGELOG.md` entry.

Use Conventional Commit types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`, `perf`, `style`. Use the `BREAKING CHANGE:` footer for major bumps. Only `feat`, `fix` and `perf` (and breaking changes) release a version; the other types release nothing.

A commit-msg hook validates that every commit message conforms to the Conventional Commits format. Malformed messages are rejected locally before push, so PRs arrive with a history semantic-release can parse without manual cleanup.

## Style and conventions

- **Language:** TypeScript with `strict: true`. No `any` outside test scaffolding.
- **Functional style, no classes.** Stores, services and adapters are factory functions returning closures (for example `createInMemoryTransferStore(opts): TransferStore`), not `class … implements`. State is captured in the closure, not on `this`. This is pragmatic FP: `Map`, `async/await` and local mutation inside a closure are fine. The goal is no `class`/`new`/`this`/inheritance in the public surface, not purity (a one-time-use store is inherently stateful).
- **Testing:** Vitest. Each route handler and helper has tests, including explicit security and negative cases (forged detection signals, replay attempts, malformed `next` redirects).
- **Commits:** Conventional Commits (see above). Atomic: one logical change per commit.
- **Formatting:** Prettier defaults; ESLint with `@typescript-eslint/recommended`.
- **No emoji in code or commit messages.** Emoji are fine in README headings.
- **License:** MIT, declared once via the root `LICENSE` file and `package.json` `"license": "MIT"`. Do not add per-file SPDX or copyright headers; the root declaration covers the whole package.

## Threat model discipline

[docs/threat-model.md](docs/threat-model.md) is the registry of the security invariants of the bridge. Any change touching the bridge or consume routes, `transferStore` behaviour, cookie attribute setting, or wrapper-detection logic requires a corresponding update to `threat-model.md` and a test for the relevant negative case. This is enforced at PR review. Read the registry before changing any of those areas.

## Local development

```bash
# Install
pnpm install

# Build and test the package
pnpm build
pnpm test

# Run the reference example app
pnpm --dir examples/tenant-app dev
```

Code is formatted with Prettier and linted with ESLint (see Style and conventions above).

## Pre-commit hook

The repo includes a pre-commit hook at `.githooks/pre-commit`. To activate it once per clone:

```bash
git config core.hooksPath .githooks
```

The hook is a no-op by default. To enable pattern matching, create a local-only patterns file (not tracked by git):

```bash
touch .git/local-patterns.txt
echo "your-pattern-here" >> .git/local-patterns.txt
```

Each line in `.git/local-patterns.txt` is a case-insensitive regex. The hook checks staged additions against the patterns and aborts the commit if any match.
