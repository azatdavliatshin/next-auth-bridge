---
phase: 03-client-helpers-pages-middleware
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - packages/core/src/is-trusted-message.ts
  - packages/core/src/detect-context.ts
  - packages/core/src/popup-flow.ts
  - packages/core/src/middleware.ts
  - packages/core/src/open-auth-popup.ts
  - packages/core/src/index.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This is security-critical cross-context auth code (Mode A popup bridge). I reviewed
all six source files against the threat-model invariants and the locked Phase 3
decisions (D-01..D-16), and read the corresponding test suites to judge negative-case
coverage. The full suite is green (96 tests).

The headline security invariants are correctly implemented:

- **THREAT-03 (postMessage origin AND source):** `isTrustedMessage` requires BOTH the
  origin allowlist match AND strict `===` source identity, and `openAuthPopup` applies
  it before reading the handle. Both negative cases (wrong-origin, wrong-source racer)
  are tested. Correct.
- **targetOrigin never `"*"`:** `runPopupFlow` posts with the explicit `deps.hostOrigin`
  on both the success and error paths; there is no `"*"` anywhere. Correct and tested.
- **No session token in any client-constructed URL (THREAT-07/CLIENT-05):** confirmed in
  `runPopupFlow` (only `{ source, type, code }` crosses postMessage; the body is narrowed
  so leaked extra fields are dropped) and in the roundtrip e2e sweep. Correct.
- **Context detection is UX-only, not a security boundary (CLIENT-04):** `middleware.ts`
  imports no store / `verifySession` / `node:crypto`; a forged `Sec-Fetch-Dest` only
  changes the rewrite target. Behavioural + structural assertions present. Correct.
- **Listener/timer cleanup:** `openAuthPopup`'s `cleanup()` is guarded by a `settled`
  flag (idempotent, single-settle), tears down listener + close-poll + timeout on every
  path, and the re-arming close-poll stops on `cleared`. No leak or double-settle found.

No BLOCKER-tier defects. The findings below are robustness/hardening gaps and quality
items. The most important is WR-01: the public `isTrustedMessage` predicate trusts a
falsy `expectedSource` against a falsy `event.source`, a footgun for external callers
even though the in-package caller is currently safe.

## Warnings

### WR-01: `isTrustedMessage` trusts a falsy `expectedSource` matching a falsy `event.source`

**File:** `packages/core/src/is-trusted-message.ts:55-57`
**Issue:** The source-identity check is a bare `event.source !== opts.expectedSource`.
If a caller passes a falsy `expectedSource` (e.g. `null`/`undefined` — the value of
`window.opener`/a popup ref before the window is assigned, or `0`), then any message
whose `source` is the same falsy value passes the identity check. This predicate is a
*public export* (`index.ts:48`) and is explicitly documented as a self-contained,
separately-importable security boundary, so it will be wired by external consumers who
may not replicate `openAuthPopup`'s truthiness guard. The in-package caller
(`open-auth-popup.ts:232` rejects `!popupWin` before registering the listener) is
currently safe, so this is not an active exploit in this codebase — but the predicate
should defend its own contract rather than rely on every caller pre-validating.
**Fix:** Reject a non-object/falsy `expectedSource` outright so the predicate cannot
be satisfied by a forged falsy source:
```ts
export function isTrustedMessage(
  event: MessageEventLike,
  opts: { allowedOrigins: readonly string[]; expectedSource: unknown },
): boolean {
  // A real MessageEvent.source is always a non-null Window/MessagePort. A falsy
  // expectedSource is a caller error (the popup ref was not captured) — never trust it.
  if (opts.expectedSource == null) return false;
  if (!opts.allowedOrigins.includes(event.origin)) return false;
  if (event.source !== opts.expectedSource) return false;
  return true;
}
```
Add a negative test: `expectedSource: null` + `source: null` (allowed origin) returns
`false`.

### WR-02: `cleanup()` teardown is not exception-isolated — a throwing unsubscribe leaks the timers

**File:** `packages/core/src/open-auth-popup.ts:249-255`
**Issue:** `cleanup()` runs `unsubscribe(); clearClosePoll(); clearTimeoutTimer();`
sequentially. If `unsubscribe()` throws (a custom injected `addMessageListener` whose
returned teardown throws, or a browser `removeEventListener` shim that throws), the
close-poll and timeout timers are never cleared — a real timer leak — and the throw
propagates out of the message handler / poll callback. The file's own contract promises
teardown of "the message listener, the close-poll, and the timeout ... exactly once —
no listener or timer leaks" on *every* settle path; one throwing teardown breaks that
guarantee for the remaining resources. Not covered by tests (the fakes never throw).
**Fix:** Isolate each teardown so one failure cannot strand the others:
```ts
const cleanup = (): void => {
  if (settled) return;
  settled = true;
  for (const teardown of [unsubscribe, clearClosePoll, clearTimeoutTimer]) {
    try { teardown(); } catch { /* best-effort: never let one leak the rest */ }
  }
};
```

### WR-03: `popupTarget` defaults to a fixed named window — concurrent calls collide

**File:** `packages/core/src/open-auth-popup.ts:222`
**Issue:** `popupTarget` defaults to the constant string `"next-auth-bridge-popup"`. With
a real `window.open`, a fixed (non-`"_blank"`) target name means a second `openAuthPopup`
call while a popup is already open *reuses the same browser window* instead of opening a
new one. The two in-flight promises then share one window: the reused `open()` may not
trigger the navigation/flow expected by the second caller, and the first caller's
close-poll/timeout still races against a window the second call now also references. This
is a correctness hazard for any UI that can trigger the flow twice (double-click, retry).
The DI tests never exercise this because the fake `open` returns a fresh popup per call.
**Fix:** Default to a unique target so each call gets its own window, or document that the
caller must serialize calls:
```ts
const popupTarget = deps.popupTarget ?? "_blank";
```
(If a stable name is wanted for focus-reuse, gate re-entry so a second call rejects or
focuses the existing window rather than racing a shared one.)

### WR-04: Middleware rewrite target is not constrained to same-origin

**File:** `packages/core/src/middleware.ts:98`
**Issue:** `new URL(options.popupEntryPath, request.url).toString()` resolves
`popupEntryPath` against the request URL. If `popupEntryPath` is ever an absolute URL
(`https://elsewhere/...`) or a protocol-relative value (`//evil/...`), the base is
ignored and the rewrite destination becomes a foreign origin. `NextResponse.rewrite` to a
cross-origin URL is a proxy-to-arbitrary-origin primitive. `popupEntryPath` is app config
(not request input), so this is defense-in-depth rather than an active vuln — but the
factory makes no guarantee the value is a same-origin path, and a misconfiguration
silently becomes an open proxy. The doc comment even says "e.g. `/auth/popup`" implying a
path is expected, but nothing enforces it.
**Fix:** Validate that the resolved destination stays same-origin as the request, and
reject/passthrough otherwise:
```ts
const reqUrl = new URL(request.url);
const dest = new URL(options.popupEntryPath, reqUrl);
if (dest.origin !== reqUrl.origin) return undefined; // never rewrite cross-origin
return { action: "rewrite", destination: dest.toString() };
```

## Info

### IN-01: `runPopupFlow` posts an error message even when no opener exists

**File:** `packages/core/src/popup-flow.ts:133`
**Issue:** `deps.opener` is typed required and non-nullable, but in a real popup
`window.opener` can be `null` (popup opened by user navigation, or opener already closed).
A caller wiring `opener: window.opener` would pass `null` and `null.postMessage(...)`
throws — and because the post is *after* the try/catch, the throw is uncaught. The
function's contract ("posts a structured auth-error rather than throwing") does not hold
if the opener itself is missing.
**Fix:** Either keep the required-non-null contract and document that the caller must
guarantee a live opener, or guard the post and no-op when `opener` is falsy.

### IN-02: `runPopupFlow` and `open-auth-popup` duplicate the message-namespace + shape constants

**File:** `packages/core/src/popup-flow.ts:26,76-87` and `packages/core/src/open-auth-popup.ts:69,125-141`
**Issue:** The namespace literal (`"next-auth-bridge"`) and the `auth-success` /
`auth-error` message shapes are independently re-declared in both the sender and the
receiver (`MESSAGE_SOURCE` vs `MESSAGE_NAMESPACE`; `AuthSuccessMessage`/`AuthErrorMessage`
vs the inline `BridgeMessage` union). They must agree exactly for the channel to work;
nothing structurally ties them together, so a future edit to one side can silently desync
the wire contract. Note also a field-name mismatch: the sender emits `{ ..., reason }` on
error (`popup-flow.ts:138`) while the receiver's `BridgeMessage` models the error as
`{ ..., error? }` (`open-auth-popup.ts:127`). Harmless today (the receiver only branches
on `type`), but it shows the two ends have already drifted.
**Fix:** Extract the shared namespace constant and the message-shape union into one module
(e.g. `bridge-message.ts`) and import it in both, so sender and receiver cannot diverge.

### IN-03: `detectContext` default casts `globalThis` to `WindowLike` — silently returns `"browser"` server-side

**File:** `packages/core/src/detect-context.ts:51`
**Issue:** The default param is `globalThis as unknown as WindowLike`. On a server
(`globalThis.self`/`globalThis.top` are `undefined`), `self !== top` is `undefined !==
undefined` → `false` → `"browser"`. D-06 specifies this helper is client-only; the cast
removes any signal that it was misused server-side (it just answers `"browser"` instead of
throwing or being obviously wrong). Because it is UX-only this cannot grant access, so it
is Info, not a defect — but the silent-wrong-answer-on-server behavior is worth a guard or
an explicit doc note that calling it server-side always yields `"browser"`.
**Fix:** Add a brief note in the doc comment that a non-browser global resolves to
`"browser"` by design, or guard `typeof window === "undefined"` at the call sites.

### IN-04: `asBridgeMessage` re-imposes namespace/type checks that the comment says ride only on the receiver

**File:** `packages/core/src/open-auth-popup.ts:130-141`
**Issue:** Minor naming/consistency: `asBridgeMessage` returns a `BridgeMessage` whose
error arm is `{ type: "auth-error"; error?: unknown }`, but the sender never sets `error`
(it sets `reason`). The narrowed `error` field is therefore always `undefined` and dead.
Not a bug (the value is never read), but it is dead surface that suggests a contract the
sender does not honor.
**Fix:** Align the receiver's error arm with the sender's `reason` field (or drop the
unused payload field entirely) — see IN-02 for the shared-module remedy.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
