---
phase: 02-bridge-consume-routes
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - packages/core/src/auth-helpers.ts
  - packages/core/src/bridge-route.ts
  - packages/core/src/consume-route.ts
  - packages/core/src/cookie-codec.ts
  - packages/core/src/create-auth-bridge.ts
  - packages/core/src/index.ts
  - packages/core/src/transfer-store/types.ts
  - packages/core/src/types.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-06-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the security-critical bridge/consume handoff: the opaque-handle mint
(`bridge-route.ts`), the handle exchange + cookie re-set (`consume-route.ts`),
the redirect/cookie-name helpers (`auth-helpers.ts`), the hand-rolled cookie
codec (`cookie-codec.ts`), the wiring factory, and the types.

The core invariants are mostly well implemented and well tested: the session
gate runs first and independently (THREAT-04), decoys are excluded by an
integer-suffix-bounded harvest (THREAT-05), the success path sets zero cookies
(AM-2), bad/forged/absent/empty handles all collapse to a single no-cookie 4xx
with the store-call guarded textually before the store (THREAT-06/AM-1), and the
Set-Cookie floors are CHIPS-correct (Secure/HttpOnly/SameSite=None/Partitioned).

However, `sanitizeNext` has a real open-redirect bypass via backslash
normalization (THREAT-08), which is the headline finding. There are also several
robustness gaps around header injection and input validation that should be
closed before this ships as the package's "deeply correct" core value.

The Origin allowlist comparison and the `maxAge`/cookie-value serialization paths
trust their inputs more than a security-critical handoff should.

## Critical Issues

### CR-01: sanitizeNext open-redirect bypass via backslash normalization (THREAT-08)

**File:** `packages/core/src/auth-helpers.ts:34-52`
**Issue:** `sanitizeNext` only rejects protocol-relative targets that begin with
two forward slashes (`next.startsWith("//")`). It does not account for the fact
that browsers (and the URL/WHATWG parser) treat backslashes as forward slashes
in the path/authority position. A `next` value such as `/\evil.test/phish` or
`/\/evil.test` passes every check:

- `next.startsWith("/")` is true (single leading forward slash),
- `next.startsWith("//")` is false (second char is `\`, not `/`),
- it is not in the `/auth` or `/api/auth` namespace,

so the raw value `/\evil.test/phish` is returned verbatim and written into the
`Location` header at `consume-route.ts:139,150`. Browsers normalize `Location:
/\evil.test/phish` to `//evil.test/phish` → a protocol-relative off-site redirect
to an attacker host. This is precisely the open-redirect class THREAT-08 /
ROUTE-06 / CLAUDE.md invariant 7 exists to prevent, and it lands on the
authenticated post-consume navigation. The existing test only covers `//evil`,
not the backslash variant, so the suite is green while the control is bypassable.

**Fix:** Normalize backslashes before the slash checks (or reject any target
containing a backslash), and reject any second character that is a slash OR
backslash:
```ts
export function sanitizeNext(next: string | null | undefined): string {
  if (!next) return "/";
  // Treat backslashes as slashes the way browsers do, then reject
  // protocol-relative / absolute / non-path targets.
  if (next[0] !== "/" || next[1] === "/" || next[1] === "\\") return "/";
  if (next.includes("\\")) return "/"; // no backslash anywhere (belt-and-suspenders)
  const lower = next.toLowerCase();
  if (
    lower === "/auth" ||
    lower.startsWith("/auth/") ||
    lower === "/api/auth" ||
    lower.startsWith("/api/auth/")
  ) {
    return "/";
  }
  return next;
}
```
Add negative tests for `/\evil.test`, `\\evil.test`, `/\/evil.test`, and a
mixed `/%5Cevil` decoded variant.

## Warnings

### WR-01: Cookie chunk values are written into Set-Cookie without CRLF/delimiter sanitization

**File:** `packages/core/src/cookie-codec.ts:92-107`, `packages/core/src/consume-route.ts:77-88`
**Issue:** `serializeSetCookie` interpolates `name` and `value` directly into the
header string (`` `${name}=${value}` ``) with no validation. The values come from
`harvestSessionChunks`, which preserves the raw cookie value verbatim from the
incoming `Cookie` header. While these originate from the user's own
Auth.js-managed session cookie (so this is not directly attacker-injected today),
a value containing `;`, a newline, or `Partitioned`-overriding attributes would
corrupt the emitted header or split it. For a security-critical, hand-rolled
codec the "cannot fail" core value argues for defense-in-depth: a malformed or
adversarially-shaped stored value should never be able to alter the attribute set
or inject a second header. There is no test asserting rejection/escaping of a
value containing `;`, `\r`, or `\n`.

**Fix:** Validate (or reject the chunk for) values/names containing control
characters or cookie delimiters before serializing:
```ts
const FORBIDDEN = /[\x00-\x1F;,\s]/; // control chars, ; , and whitespace incl CR/LF
export function serializeSetCookie(name: string, value: string, opts: { maxAge?: number }): string {
  if (FORBIDDEN.test(name) || /[\x00-\x1F;,]/.test(value)) {
    throw new Error("serializeSetCookie: illegal character in cookie name/value");
  }
  // ...existing assembly
}
```
Add a negative test feeding a chunk value with `\r\n` and a `;`.

### WR-02: maxAge is interpolated into Set-Cookie without integer validation

**File:** `packages/core/src/cookie-codec.ts:105`
**Issue:** `if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`)`. The
public `maxAge?: number` option is interpolated raw. A non-integer (`60.5`),
`NaN`, `Infinity`, or a negative value would produce a malformed or
nonsensical `Max-Age` attribute (`Max-Age=NaN`, `Max-Age=Infinity`). The
`!= null` guard intentionally allows `0`, but does not constrain the value to a
non-negative integer. This is config-supplied, not attacker-supplied, so it is a
robustness defect rather than a vulnerability, but it silently emits an invalid
header instead of failing loud — inconsistent with the D-07 "loud
misconfiguration" stance taken for `ttlSeconds`.

**Fix:** Validate at the boundary (either in `serializeSetCookie` or when
constructing options):
```ts
if (opts.maxAge != null) {
  if (!Number.isInteger(opts.maxAge) || opts.maxAge < 0) {
    throw new Error(`serializeSetCookie: maxAge must be a non-negative integer (got ${opts.maxAge})`);
  }
  parts.push(`Max-Age=${opts.maxAge}`);
}
```

### WR-03: Origin allowlist comparison is exact-string and case/format brittle

**File:** `packages/core/src/bridge-route.ts:61-64`, `packages/core/src/consume-route.ts:109-112`
**Issue:** The Origin gate uses `!options.allowedOrigins.includes(origin)`, an
exact case-sensitive string match against the raw `Origin` header. Origins are
case-insensitive in scheme/host, and a trailing-slash or default-port variant
(`https://app.test:443`) will not match `https://app.test`. While this fails
*closed* (an unexpected-but-legitimate Origin is rejected, not accepted), it is
brittle: a config that looks correct can silently 403 all traffic, and because
this is documented as defense-in-depth, a subtle misconfiguration here can be
hard to diagnose. More importantly there is no normalization, so the allowlist
semantics depend on callers hand-matching the browser's exact serialization.

**Fix:** Normalize both sides before comparison (lowercase, strip trailing
slash), or document explicitly that allowedOrigins must be the exact
browser-serialized origin. At minimum:
```ts
const normalize = (o: string) => o.trim().toLowerCase().replace(/\/$/, "");
const allow = new Set(options.allowedOrigins.map(normalize));
if (origin !== null && !allow.has(normalize(origin))) { /* reject */ }
```
Note: build the normalized set once at handler construction, not per request.

### WR-04: Duplicated Origin-check logic across both handlers risks divergence

**File:** `packages/core/src/bridge-route.ts:61-64`, `packages/core/src/consume-route.ts:109-112`
**Issue:** The Origin allowlist check is copy-pasted verbatim into both
`createBridgeHandler` and `createConsumeHandler` (including the `origin !== null`
absent-Origin pass-through). Since this is a security control shared by both
routes and wired from one config (D-10), duplicating it means a future fix (e.g.
WR-03 normalization, or a change to the absent-Origin policy) must be applied in
two places and can silently diverge between the two halves of the handshake.

**Fix:** Extract a single `checkOrigin(request, allowedOrigins): boolean` (or a
`rejectIfDisallowedOrigin` helper returning `Response | null`) and call it from
both handlers, so the two routes provably share one implementation.

## Info

### IN-01: harvestSessionChunks degenerates if base resolves to an empty string

**File:** `packages/core/src/cookie-codec.ts:61-76`, `packages/core/src/auth-helpers.ts:65-73`
**Issue:** `getAuthCookieName` returns `opts.cookieName` whenever it is truthy,
but an explicit `cookieName: ""` is falsy and silently falls through to the
secure default — surprising but safe. More relevant: if `base` were ever an empty
string, `harvestSessionChunks` would match any cookie of the form `.<int>`
(`name.startsWith("." )` + numeric suffix), an over-broad sweep. This is not
currently reachable through the public API, but the harvest is the THREAT-05
boundary and an empty/whitespace base should be rejected rather than silently
producing a degenerate match set.

**Fix:** Guard against an empty resolved base (throw, or treat as no match) in
`harvestSessionChunks`, and/or validate `cookieName` is non-empty in
`getAuthCookieName`.

### IN-02: Repeated inline Origin-check comment blocks duplicate the type-level docs

**File:** `packages/core/src/bridge-route.ts:57-60`, `packages/core/src/consume-route.ts:105-108`
**Issue:** The Origin-check rationale (D-12/D-14, defense-in-depth, absent-Origin
pass-through) is restated nearly verbatim in the file header, the JSDoc, and the
inline comment in both files. The density is high enough that the actual one-line
control is easy to miss, and any policy change must be reflected in several prose
locations. This is a maintainability note, not a correctness issue.

**Fix:** Consolidate the rationale to one location (the extracted helper from
WR-04 is the natural home) and keep the call sites terse.

---

_Reviewed: 2026-06-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
