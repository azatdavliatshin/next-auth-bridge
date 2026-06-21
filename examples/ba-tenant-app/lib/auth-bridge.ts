// The single server-side wiring point for the cross-context handoff.
//
// THE AGNOSTIC SEAM. This file is a near-verbatim copy of the Auth.js set's
// lib/auth-bridge.ts; the ONLY differences are the two `createAuthBridge` args
// the auth library forces — `verifySession` and `cookieName`. The bridge/consume
// routes, the transport, the launcher, and the middleware around it are byte-for-
// byte copies. That sameness IS the auth-library-agnostic claim's evidence.
//
// `createAuthBridge` returns both the `/auth/bridge` (mint) and `/auth/consume`
// (redeem) handlers from one shared config:
//   - store:          the production transfer store, backed by Upstash Redis. The
//                     KV adapter is imported from the dedicated subpath ONLY, so
//                     the Edge middleware import graph never pulls Redis in. The KV
//                     import is identical to the Auth.js set — only the deploy-time
//                     namespace differs (D-02).
//   - verifySession:  the real security gate — the bridge mints a handle only after
//                     Better Auth confirms a genuine session via
//                     auth.api.getSession (the analog of Auth.js's () => auth()).
//                     getSession returns `{ session, user } | null`; verifySession
//                     only asks the truthy/null question, so returning the whole
//                     object is correct.
//   - cookieName:     the Better Auth session-cookie base name, DERIVED from the
//                     Phase 7 helper (never a hardcoded `__Secure-` literal). This
//                     is what the harvest matches; a literal mismatch silently
//                     yields a signed-out tenant (AGNOSTIC-05 / Pitfall 1).
//   - allowedOrigins: the cross-site allowlist. The embedding host shell and the
//                     app's own origin are distinct sites (the whole point of the
//                     CHIPS handoff), so both are listed explicitly from env.
//   - secure:         production runs over HTTPS, so the __Secure- cookie name is
//                     used.

import { headers } from "next/headers";
import { createAuthBridge, getBetterAuthCookieName } from "next-auth-bridge";
import { createKVTransferStore } from "next-auth-bridge/store/kv";

import { auth } from "@/lib/auth";

export const { bridge, consume } = createAuthBridge({
  store: createKVTransferStore(),
  verifySession: async () => auth.api.getSession({ headers: await headers() }),
  cookieName: getBetterAuthCookieName({ secure: true }),
  allowedOrigins: [
    process.env.HOST_SHELL_ORIGIN ?? "",
    process.env.APP_ORIGIN ?? "",
  ],
  secure: true,
});
