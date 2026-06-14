// next-auth-bridge — route/option types for the createAuthBridge factory.
//
// These are the wiring types the Wave 2/3 route handlers and the config factory
// consume. They are deliberately structural and version-agnostic: NO concrete
// Auth.js type is imported anywhere, so the package's public surface never
// couples to a specific Auth.js major (D-04).
//
// NOTE: this is the top-level src/types.ts, distinct from
// transfer-store/types.ts (which owns the TransferStore contract + the D-01
// TransferPayload shape). This file imports the TransferStore type from there
// (type-only) but does not redefine it.

import type { TransferStore } from "./transfer-store/types.js";

/**
 * The app-injected session verifier — the core security gate (D-04 / ROUTE-01).
 *
 * The app supplies its own `() => auth()` (or equivalent). The bridge calls it
 * and only asks the single truthy/null question: is there a real session? It
 * NEVER decodes a token or duplicates Auth.js internals — the app owns the
 * mechanism (its providers, strategy, Auth.js version), the bridge owns the
 * refuse decision (401 on a falsy result). Typed as
 * `() => Promise<unknown | null>` precisely because the bridge only checks
 * truthiness — this keeps it strategy- and version-agnostic (RESEARCH Pattern 1).
 */
export type VerifySession = () => Promise<unknown | null>;

/**
 * The options that wire both handlers from one config (D-10 / D-11). A single
 * factory (`createAuthBridge`) captures this and returns `{ bridge, consume }`.
 *
 * Required (the irreducible wiring): `store`, `verifySession`, `allowedOrigins`.
 * Optional-with-defaults: `cookieName`, `secure`, `maxAge`.
 *
 * The helpers `getAuthCookieName` / `sanitizeNext` are intentionally NOT carried
 * here — they stay separately importable (D-11).
 */
export interface AuthBridgeOptions {
  /**
   * The Phase 1 transfer store adapter (in-memory on the test bench, Vercel KV
   * in production). The bridge calls `store.create`, consume calls
   * `store.consume`. Required (D-11).
   */
  store: TransferStore;

  /**
   * The app-injected session verifier (D-04). The bridge refuses (401) when it
   * resolves falsy. Required (D-11) — the security gate has no default.
   */
  verifySession: VerifySession;

  /**
   * The server-side Origin allowlist for both routes (D-12). A request whose
   * `Origin` header is present and NOT in this list is rejected (4xx); a request
   * with no `Origin` header passes through to the real gate (D-14 — top-level
   * navigations legitimately carry no Origin). Defense-in-depth, not the
   * security boundary. Required (D-11); `readonly` so a frozen config is
   * accepted (D-12).
   */
  allowedOrigins: readonly string[];

  /**
   * Explicit Auth.js session-cookie base name. Overrides the `secure`-derived
   * default in `getAuthCookieName` (D-11). Optional — defaults to the
   * secure-context name `__Secure-authjs.session-token`.
   */
  cookieName?: string;

  /**
   * Whether the deployment is a secure (HTTPS) context (D-16). Default `true`
   * keeps production correct (the `__Secure-` prefixed cookie name); `false`
   * makes the non-prefixed dev/test name reachable WITHOUT a full `cookieName`
   * override. Optional.
   */
  secure?: boolean;

  /**
   * Explicit `Max-Age` (seconds) for the re-set session-token chunks (D-17).
   * Omitted by default → session-scoped cookies (the source lifetime is not
   * capturable from the incoming request — D-03 — so it is never guessed).
   * When provided, every emitted `Set-Cookie` carries `Max-Age=<n>`. Optional.
   */
  maxAge?: number;
}
