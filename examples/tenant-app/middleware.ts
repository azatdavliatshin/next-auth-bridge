// Context-routing middleware (UX only — NOT a security boundary).
//
// When an unauthenticated request arrives from an embedding host (an iframe), a
// full-page identity-provider redirect would break inside that iframe. The
// bridge middleware instead rewrites such a request to the popup entry (the
// visible URL is unchanged). Every other case passes through to the app's own
// Auth.js flow.
//
// Edge-runtime hygiene: this file imports the routing middleware factory from the
// dedicated `next-auth-bridge/middleware` subpath — NOT the package root. The root
// entry re-exports createInMemoryTransferStore, whose graph reaches node:crypto;
// in a bundled Edge function that pulls node:crypto in and the build fails. The
// /middleware subpath is the isolated, crypto-free surface. Never import the
// server-side bridge factory or the KV store here. The real security gate is the
// server-side session check on the bridge route, not the cookie-presence check used here.

import { createBridgeMiddleware } from "next-auth-bridge/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The Auth.js session cookie base name in a secure (HTTPS) deployment. Presence
// is an edge-safe, UX-only signal — it does not verify the session.
const SESSION_COOKIE = "__Secure-authjs.session-token";

const route = createBridgeMiddleware({
  popupEntryPath: "/auth/popup",
  isAuthenticated: (req) =>
    req.headers.get("cookie")?.includes(`${SESSION_COOKIE}=`) ?? false,
});

export function middleware(request: NextRequest): NextResponse {
  const decision = route(request);
  if (decision?.action === "rewrite") {
    return NextResponse.rewrite(decision.destination);
  }
  return NextResponse.next();
}

// Scope the middleware to the tenant routes; static assets and the API are left
// untouched.
export const config = {
  matcher: ["/t/:path*"],
};
