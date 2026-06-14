// The single server-side wiring point for the cross-context handoff.
//
// `createAuthBridge` returns both the `/auth/bridge` (mint) and `/auth/consume`
// (redeem) handlers from one shared config:
//   - store:          the production transfer store, backed by Upstash Redis. The
//                     KV adapter is imported from the dedicated subpath ONLY, so
//                     the Edge middleware import graph never pulls Redis in.
//   - verifySession:  the real security gate — the bridge mints a handle only
//                     after Auth.js confirms a genuine session via () => auth().
//   - allowedOrigins: the cross-site allowlist. The embedding host shell and the
//                     app's own origin are distinct sites (the whole point of the
//                     CHIPS handoff), so both are listed explicitly from env.
//   - secure:         production runs over HTTPS, so the __Secure- cookie name is
//                     used.

import { createAuthBridge } from "next-auth-bridge";
import { createKVTransferStore } from "next-auth-bridge/store/kv";

import { auth } from "@/auth";

export const { bridge, consume } = createAuthBridge({
  store: createKVTransferStore(),
  verifySession: () => auth(),
  allowedOrigins: [
    process.env.HOST_SHELL_ORIGIN ?? "",
    process.env.APP_ORIGIN ?? "",
  ],
  secure: true,
});
