// next-auth-bridge — pure, stateless auth helpers (sanitizeNext + getAuthCookieName).
//
// ROUTE-06 / THREAT-08 (open-redirect): sanitizeNext is the server-side control
// that decides where /auth/consume may redirect. The client-supplied `next` is
// attacker-controllable, so this is a trust boundary. Per D-09 the function
// fail-safe DEGRADES an unsafe target to "/" rather than erroring the whole
// flow — but the unsafe target is NEVER returned. It rejects the auth namespace
// (/auth, /api/auth), absolute URLs, and protocol-relative (//evil) targets.
//
// D-11 / D-16 (cookie-name resolution): getAuthCookieName resolves the exact
// Auth.js session-cookie prefix that later bounds the bridge's chunk-harvest
// scope. An explicit `cookieName` wins (D-11); otherwise the `secure` flag
// selects the prefix — default `secure: true` keeps production correct, and
// `secure: false` makes the non-prefixed dev/test name reachable (D-16).
//
// Both are bare exported functions (no class, no factory) and stay SEPARATELY
// importable — they are deliberately NOT bundled into the createAuthBridge
// factory return (D-11), keeping the v0.1 public surface minimal.

/**
 * Validate a client-supplied redirect target, degrading any unsafe value to the
 * safe default "/" (D-09). The malicious target is never returned.
 *
 * Rejected (→ "/"):
 * - falsy (null / undefined / empty string)
 * - non-path or absolute targets (anything not starting with a single "/")
 * - protocol-relative targets ("//evil.test/..." — the classic open-redirect
 *   bypass; the attacker host is never honored)
 * - backslash-prefixed targets ("/\evil.test" — browsers normalize "\" to "/",
 *   so "/\evil" becomes the protocol-relative "//evil"; the second character is
 *   never allowed to be a slash OR a backslash)
 * - the auth namespace: "/auth", "/auth/...", "/api/auth", "/api/auth/..."
 *   (case-insensitive — ROUTE-06 / THREAT-08)
 *
 * Anything else (a safe, same-origin path) passes through verbatim.
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next) return "/";
  // Reject absolute + protocol-relative + non-path: a safe target is a single
  // leading slash NOT followed by another slash. "//evil" starts with "/" but
  // is a protocol-relative URL, so it must be rejected explicitly. A backslash
  // in the second position is the same bypass — browsers normalize "\" to "/",
  // so "/\evil.test" resolves to "//evil.test" (off-site). Reject any "/" or
  // "\" as the second character; reject any backslash anywhere defensively.
  if (
    !next.startsWith("/") ||
    next[1] === "/" ||
    next[1] === "\\" ||
    next.includes("\\")
  ) {
    return "/";
  }
  // Reject the auth namespace (case-insensitive), matching the exact segment or
  // a trailing-boundary path so "/authzzz" is not falsely rejected.
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

/**
 * Resolve the Auth.js session-cookie base name that bounds the bridge's
 * chunk-harvest scope.
 *
 * Precedence (D-11 / D-16):
 * 1. an explicit `cookieName` override always wins;
 * 2. otherwise `secure === false` yields the non-prefixed dev/test name
 *    `authjs.session-token` (D-16 reachability);
 * 3. otherwise (the default — `secure` true or omitted) the secure-context
 *    name `__Secure-authjs.session-token`, keeping production correct.
 */
export function getAuthCookieName(opts: {
  cookieName?: string;
  secure?: boolean;
}): string {
  if (opts.cookieName) return opts.cookieName;
  return opts.secure === false
    ? "authjs.session-token"
    : "__Secure-authjs.session-token";
}
