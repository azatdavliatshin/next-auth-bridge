# Milestones — next-auth-bridge

Human-readable history of milestone boundaries (independent of git tags; see also the
per-milestone archives in `.planning/milestones/`).

## v0.1.0 — Mode A (popup-bridge) — SHIPPED 2026-06-14

The first published release. Mode A cross-context authentication for Next.js / Auth.js,
deeply correct: every threat-model invariant under negative-case coverage (129 tests),
proven live in a two-origin multi-tenant Entra deployment, published to npm with SLSA
provenance.

- **Phases:** 6 (TransferStore → Routes → Client/Middleware → Threat Model → Reference Example → Release)
- **Plans:** 21
- **Requirements:** 26 satisfied (STORE·ROUTE·CLIENT·HARDEN·EXAMPLE·RELEASE)
- **npm:** next-auth-bridge@0.1.0 · **tag:** v0.1.0 · **GitHub Release:** v0.1.0
- **Archive:** [v0.1.0-ROADMAP.md](milestones/v0.1.0-ROADMAP.md) · [v0.1.0-REQUIREMENTS.md](milestones/v0.1.0-REQUIREMENTS.md) · [audit](v0.1.0-MILESTONE-AUDIT.md)
- **Deferred to later:** EXAMPLE-05 (minimal example), Mode B/PWA (v0.2), Upstash adapter, authjs recipe PR, OIDC publishing switch.

## v0.2 — Mode B (PWA-shell) + breadth — PLANNED

Not yet started. Scope via `/gsd-new-milestone`. Candidates: Mode B (ASWebAuthenticationSession),
Upstash adapter, minimal example, OIDC Trusted Publishing, authjs recipe PR.
