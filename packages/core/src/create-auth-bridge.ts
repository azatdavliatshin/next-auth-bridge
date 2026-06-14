// next-auth-bridge — the createAuthBridge config factory (ROUTE-05 / D-10).
//
// The single wiring point for the server-side handoff. The app builds ONE
// AuthBridgeOptions (store, verifySession, allowedOrigins, plus optional
// cookieName/secure/maxAge) and gets back BOTH Web-standard handlers wired from
// that one config — nothing instantiated twice (D-10). The app re-exports them
// from its App Router route.ts (e.g. `export const GET = bridge`).
//
// D-10: a SINGLE factory returning `{ bridge, consume }` — rejected separate
// createBridge/createConsume factories, which would force the app to keep two
// configs of one handshake in sync.
//
// D-11: the helpers `getAuthCookieName` / `sanitizeNext` are NOT bundled into
// this return — they stay separately importable from the package root, keeping
// the v0.1 public surface minimal.
//
// D-06: both handlers are plain Web-standard `(request) => Promise<Response>`
// closures with no Next.js runtime coupling — driven directly on the Vitest
// bench (and round-tripped bridge -> consume there).

import type { AuthBridgeOptions } from "./types.js";
import { createBridgeHandler } from "./bridge-route.js";
import { createConsumeHandler } from "./consume-route.js";

/**
 * Wire both `/auth/bridge` and `/auth/consume` handlers from one shared config
 * (ROUTE-05 / D-10).
 *
 * Constructs `createBridgeHandler(options)` and `createConsumeHandler(options)`
 * over the SAME `options` object and returns `{ bridge, consume }` — one wiring
 * point, the shared store / verifySession / allowedOrigins / cookieName / secure
 * / maxAge captured once. The helpers (`getAuthCookieName`, `sanitizeNext`) are
 * intentionally absent from the return (D-11 — separately importable).
 *
 * @param options The single AuthBridgeOptions both routes share (D-10/D-11).
 * @returns `{ bridge, consume }` — both Web-standard `(request) => Promise<Response>`.
 */
export function createAuthBridge(options: AuthBridgeOptions): {
  bridge: (request: Request) => Promise<Response>;
  consume: (request: Request) => Promise<Response>;
} {
  return {
    bridge: createBridgeHandler(options),
    consume: createConsumeHandler(options),
  };
}
