---
phase: 2
slug: bridge-consume-routes
status: secured
threats_open: 0
threats_closed: 14
asvs_level: 1
block_on: high
created: 2026-06-07
---

# SECURITY.md — Phase 2 (bridge-consume-routes)

**Audited:** 2026-06-07
**ASVS Level:** 1
**block_on:** high
**Verdict:** SECURED — 14/14 threats CLOSED
**Method:** Each declared mitigation verified in implementation source AND backed by an
asserting, passing test. Tests executed: `auth-helpers` + `bridge-route` + `consume-route`
(35 passed) and the `transfer-store` contract suite (26 passed). No mitigation accepted on
documentation/intent alone.

---

## Threat Verification (per-threat CLOSED/OPEN)

| Threat ID | Category | Disposition | Status | Code Evidence | Test Evidence |
|-----------|----------|-------------|--------|---------------|---------------|
| T-02-08 (THREAT-08) | Tampering | mitigate | CLOSED | `auth-helpers.ts:45-63` — rejects non-`/` start, `next[1]==="/"`, `next[1]==="\\"`, any `next.includes("\\")`, and `/auth`,`/auth/`,`/api/auth`,`/api/auth/` (case-insensitive) → `"/"`. CR-01 fix present (`next[1]==="\\"` + any-backslash). | `auth-helpers.test.ts:65-75` — backslash `/\evil.test`, `/\/evil`, mid-path `\` each assert `=== "/"`; plus `//evil`, absolute, auth-namespace, non-path. |
| T-02-16 (D-16) | Spoofing | mitigate | CLOSED | `auth-helpers.ts:78-86` — `cookieName` override wins; else `secure===false`→`authjs.session-token`, else `__Secure-authjs.session-token`. | `auth-helpers.test.ts:83-110` — all 4 resolution paths pinned (default, `secure:false`, `secure:true`, override-wins-over-secure). |
| T-02-01R (D-01) | Tampering | mitigate | CLOSED | `transfer-store/types.ts` — `TransferPayload = Array<{name,value}>`, zero `authCookieValue` refs in src (grep clean). | `contract.ts:60-70` — round-trip `toEqual`, each entry `Object.keys === ["name","value"]`, no key matches `/mode\|popup\|pwa\|native\|transport/i`. |
| THREAT-04 | Spoofing/Elevation | mitigate | CLOSED | `bridge-route.ts:69-72` — `verifySession()` awaited FIRST (after Origin DiD), falsy → `401` no body; mint at `:96` reached only after gate. No `?popup`/context branch gates the mint. | `bridge-route.test.ts:77-116` — no-session→401 + `createCalls===0` + `getSetCookie()===[]`; `?popup=true`+context header w/o session→still 401. |
| THREAT-05 | Tampering | mitigate | CLOSED | `cookie-codec.ts:61-76` — harvest matches `name===base \|\| (base+"."+ /^\d+$/)`; decoys excluded by construction. `bridge-route.ts:96-105` success sets ZERO Set-Cookie. | `bridge-route.test.ts:155-194` — consume minted code, payload names EXACTLY base+`.0`+`.1`; csrf/pkce/state/callback-url absent. `:149` `getSetCookie()===[]` (AM-2). |
| THREAT-09 (partial) | Info Disclosure | mitigate | CLOSED | `bridge-route.ts:102-105` — body is `JSON.stringify({ code })` only; handle never in URL. | `bridge-route.test.ts:141-149` — `code` matches `/^[0-9a-f]{64}$/`; body has no `authjs.session-token` substring, no JWT-shaped `x.y.z` match. |
| T-02-15 (D-15) | Denial of intended function | mitigate | CLOSED | `bridge-route.ts:90-92` — `harvested.length===0` → `500` BEFORE `store.create` (`:96`). | `bridge-route.test.ts:198-218` — verified session + decoy-only cookie → `5xx` + `createCalls===0`. |
| T-02-12 (D-12/D-14) | Spoofing | accept (DiD) | CLOSED | `bridge-route.ts:61-64` — present Origin not in allowlist → `403`; `origin===null` passes through to `verifySession`. Documented complementary control (header `:29-32`, comment `:57-60`). | `bridge-route.test.ts:221-260` — present-but-disallowed→`4xx`+`createCalls===0`; absent Origin (valid session+chunks)→`200`. Accepted-risk entry below. |
| THREAT-06 | Tampering/Spoofing | mitigate | CLOSED | `consume-route.ts:131-134` — `store.consume(code)`; `null`→`reject()` (`400`, no Set-Cookie). Backed by `in-memory.ts:95-107` delete-first / null-on-miss. | `consume-route.test.ts:143-176` — forged→`4xx`+`getSetCookie()===[]`; replay (consume-twice) second→`4xx`+`[]`. |
| T-02-AM1 (AM-1) | Denial/Input validation | mitigate | CLOSED | `consume-route.ts:122-124` — `if (!code) return reject()` runs BEFORE `store.consume` at `:131`. | `consume-route.test.ts:180-214` — absent + empty `?code=` → `4xx`+`[]`+`consumeCalls===0`; pre-seeded survivor code still consumable (nothing consumed). |
| ROUTE-03/CHIPS | Denial of intended function | mitigate | CLOSED | `consume-route.ts:77-88` `writeChunkCookies` → one `headers.append("Set-Cookie", serializeSetCookie(...))` per chunk; `cookie-codec.ts:97-104` floors `Path=/;Secure;HttpOnly;SameSite=None;Partitioned`. | `consume-route.test.ts:109-141` — `getSetCookie()` length === payload length; every cookie contains all 5 floors; names/values match payload. |
| T-02-08C | Tampering | mitigate | CLOSED | `consume-route.ts:139,150` — `location = sanitizeNext(next)` before `headers.set("Location", location)`. | `consume-route.test.ts:218-235` — `/auth/x`, `//evil.test/phish`, `/api/auth/signin` on valid handle → `302` `Location: "/"`. |
| T-02-12C (D-12/D-14) | Spoofing | accept (DiD) | CLOSED | `consume-route.ts:109-112` — present Origin not in allowlist → `reject()` (store NOT reached); `origin===null` proceeds to handle gate. | `consume-route.test.ts:263-292` — present-but-disallowed→`4xx`+`consumeCalls===0`; absent Origin (valid handle)→`302`. Accepted-risk entry below. |
| T-02-SC | Tampering | mitigate | CLOSED | `packages/core/package.json` — `dependencies: {}` (zero runtime deps); `@upstash/redis` is a pre-existing Phase-1 peer dep, not added this phase. No vendor Auth.js import in non-test src. Hand-rolled `cookie-codec.ts`. | N/A — verified by manifest + import grep. |

---

## Accepted Risks Log

These two entries carry disposition `accept` as **defense-in-depth** — the Origin allowlist
is documented as a *complementary* control, not the security boundary. The verified primary
boundary (THREAT-04 `verifySession` for bridge; THREAT-06 one-time opaque handle for consume)
is independently CLOSED above, so the accept disposition is sound.

- **T-02-12 — Origin allowlist on `/auth/bridge` (accept, DiD).** A present-but-disallowed
  Origin is rejected `403`; an absent Origin passes through to `verifySession` (a same-origin
  GET legitimately carries no Origin — D-14). Boundary = `verifySession` (THREAT-04, CLOSED).
  Both arms tested (`bridge-route.test.ts:221-260`). Accepted as a complementary control.
- **T-02-12C — Origin allowlist on `/auth/consume` (accept, DiD).** Present-but-disallowed
  Origin → `4xx`, store NOT reached; absent Origin proceeds to the one-time-handle gate.
  Boundary = the one-time opaque handle (THREAT-06, CLOSED). Both arms tested
  (`consume-route.test.ts:263-292`). Accepted as a complementary control.

---

## CR-01 Fix Verification (THREAT-08 backslash open-redirect)

Code review (`02-REVIEW.md`) found CR-01: `sanitizeNext` rejected `//evil` but not the
backslash variant `/\evil.test` (browsers normalize `\`→`/`, yielding a protocol-relative
off-site redirect on the authenticated post-consume navigation).

**Confirmed FIXED in commit `836362e`** ("fix(02): close sanitizeNext backslash open-redirect
bypass (CR-01/THREAT-08)"), the most recent commit touching `auth-helpers.ts` (after the
`0e8c1dc` feat and `d1a881e` test commits). Verified in current tree:
- Implementation: `auth-helpers.ts:48-49` rejects `next[1]==="\\"` AND `next.includes("\\")`.
- Tests: `auth-helpers.test.ts:65-75` assert `/\evil.test/x`, `/\/evil.test`, and a mid-path
  `/dashboard\..\evil` each degrade to `"/"`. All pass (35/35 in the route/helper suites).

This is the headline finding; it is closed in code and in test. No residual gap.

---

## Unregistered Flags

The two SUMMARY.md files (`02-02-SUMMARY.md`, `02-03-SUMMARY.md`) contain no `## Threat Flags`
section. Both instead carry a "Threat-model coverage delivered" / decision log that maps
1:1 to registered threat IDs (THREAT-04/05/06/09, T-02-08/12/15/AM1, ROUTE-03/CHIPS, D-17).
**No new, unmapped attack surface was declared during implementation. No unregistered flags.**

---

## Residual / Non-Blocking Observations (NOT phase-2 register threats — informational)

The code review raised four warnings + two infos that are **robustness hardening**, not
declared-mitigation gaps for the Phase-2 threat register. They do not block this phase (no
registered threat is OPEN), and several are explicitly attacker-out-of-reach today. Logged
here so they are not lost:

- **WR-01 (cookie-codec.ts:92-107):** `serializeSetCookie` interpolates chunk name/value with
  no CRLF/`;` sanitization. Values originate from the user's own Auth.js session cookie (not
  directly attacker-injected today), but a hand-rolled "deeply correct" codec warrants
  defense-in-depth escaping/rejection. No test for `\r\n`/`;` in a value.
- **WR-02 (cookie-codec.ts:105):** `maxAge` interpolated raw — a non-integer/`NaN`/`Infinity`/
  negative would emit a malformed `Max-Age`. Config-supplied (not attacker), but should
  fail-loud like `ttlSeconds` (D-07).
- **WR-03 (bridge-route.ts:61-64, consume-route.ts:109-112):** Origin comparison is exact
  case-sensitive string match; fails *closed* (rejects unexpected, never accepts), so no
  privilege escalation — a brittleness/diagnosability concern only.
- **WR-04 (same locations):** Origin-check logic duplicated across both handlers; future fix
  could diverge. Maintainability.
- **IN-01 (cookie-codec.ts:61-76):** if `base` resolved to `""`, `harvestSessionChunks` would
  over-match `.<int>` cookies. Not reachable via the public API today (`getAuthCookieName`
  never returns `""`).
- **IN-02:** duplicated Origin-check rationale comments. Maintainability.

These are recommended for a follow-up hardening pass (candidates for the Phase-4 threat-model
doc + tests) but are out of scope for verifying the Phase-2 declared register, which is fully
CLOSED.
