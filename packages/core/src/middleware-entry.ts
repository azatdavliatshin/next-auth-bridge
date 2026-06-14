// next-auth-bridge/middleware — the Edge-safe entry.
//
// The main entry (`.`) re-exports createInMemoryTransferStore, whose import graph
// reaches transfer-store/generate-code.ts -> node:crypto. In a single-entry
// bundle that node:crypto import is statically pulled into `dist/index.js`, so a
// Next.js Edge middleware that imports ANYTHING from the package main entry (even
// the store-free createBridgeMiddleware) drags node:crypto into the Edge runtime
// and the build fails ("Edge Function is referencing unsupported modules:
// node:crypto").
//
// This dedicated subpath isolates the genuinely Edge-safe surface — the routing
// middleware and the context classifier, both of which are self-contained
// (zero imports) — into its own chunk that never references generate-code or
// node:crypto. Edge middleware MUST import from here, not from the package root.

export { createBridgeMiddleware } from "./middleware.js";
export type {
  BridgeMiddlewareOptions,
  RequestLike,
  RouteDecision,
} from "./middleware.js";

export { detectContext } from "./detect-context.js";
export type { BridgeContext } from "./detect-context.js";
