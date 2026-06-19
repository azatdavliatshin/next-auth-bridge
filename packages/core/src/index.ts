// next-auth-bridge — main entry.
//
// Re-exports the locked TransferStore interface and the mode-agnostic
// TransferPayload type (plus the shared construction options), and the
// dependency-free in-memory adapter factory. The KV adapter lives behind the
// ./store/kv subpath and is never imported here (D-11).

export type {
  TransferStore,
  TransferPayload,
  TransferStoreOptions,
} from "./transfer-store/types.js";

// The dependency-free in-memory adapter factory (STORE-02) — the Vitest
// test-bench backend and reference implementation, re-exported from the main
// entry (D-11).
export { createInMemoryTransferStore } from "./transfer-store/in-memory.js";

// The single config factory that wires both /auth/bridge and /auth/consume from
// one shared options object (ROUTE-05 / D-10). The one wiring point the Phase 5
// example app and the Phase 3 client flow consume.
export { createAuthBridge } from "./create-auth-bridge.js";

// The pure auth helpers — stay SEPARATELY importable from the package root, NOT
// bundled into the createAuthBridge return (D-11).
export {
  getAuthCookieName,
  getBetterAuthCookieName,
  sanitizeNext,
} from "./auth-helpers.js";

// The wiring types the app supplies to createAuthBridge (D-04 / D-11). The KV
// adapter stays behind the ./store/kv subpath and is deliberately NOT re-exported
// from the main entry (D-11).
export type { AuthBridgeOptions, VerifySession } from "./types.js";

// ---------------------------------------------------------------------------
// Phase 3 client surface (D-13 / D-16) — the four new client/edge helpers, each
// a bare re-export in the same discipline as getAuthCookieName/sanitizeNext (NOT
// bundled into any factory return). No ./react or .tsx subpath is added (D-13):
// the package carries no DOM/React entry.
//
// D-16 reconciliation (Phase 6 build-break fix): createBridgeMiddleware and
// detectContext ALSO ship from a dedicated `./middleware` subpath
// (src/middleware-entry.ts). The original D-16 reasoning — "Edge-safety comes
// from a store-free import graph, not a subpath" — held at the SOURCE level but
// was defeated by the single-entry bundle: this main entry re-exports
// createInMemoryTransferStore, whose graph reaches node:crypto, and the bundled
// `dist/index.js` statically imports that chunk. A Next.js Edge middleware
// importing createBridgeMiddleware from the package ROOT therefore pulled
// node:crypto into the Edge runtime and failed the Vercel build. The `./middleware`
// subpath is the isolated, crypto-free chunk Edge code must import from; the
// root re-exports below remain for non-Edge (Node/server) consumers.
// ---------------------------------------------------------------------------

// detectContext — classify the runtime context (iframe / browser / pwa-shell)
// for UX routing only (never a security boundary).
export { detectContext } from "./detect-context.js";

// isTrustedMessage — the popup -> opener postMessage trust predicate (origin
// allowlist AND source identity, both required).
export { isTrustedMessage } from "./is-trusted-message.js";

// runPopupFlow — the popup-side flow that posts the one-time bearer handle back
// to its opener.
export { runPopupFlow } from "./popup-flow.js";

// openAuthPopup — the opener-side launcher that opens the popup and awaits the
// trusted handle message. Its typed rejection (OpenAuthPopupError) and the
// discriminant reason union are re-exported so a consumer can branch on the
// distinguishable failure mode (popup-blocked / popup-closed / timeout /
// auth-error) and surface it in UI.
export { openAuthPopup, OpenAuthPopupError } from "./open-auth-popup.js";
export type { OpenAuthPopupFailureReason } from "./open-auth-popup.js";

// createBridgeMiddleware — the wrapper/iframe detection + redirect-routing
// middleware. Re-exported here for Node/server consumers; Edge middleware must
// import it from the crypto-free `next-auth-bridge/middleware` subpath instead
// (see the D-16 reconciliation note above).
export { createBridgeMiddleware } from "./middleware.js";

// The runtime context classification type (D-13).
export type { BridgeContext } from "./detect-context.js";
