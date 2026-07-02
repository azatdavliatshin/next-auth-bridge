// Better Auth server config for the reference tenant app — the single biggest
// delta vs. the Auth.js set (which uses `NextAuth({...})`). This file is the
// agnostic-claim evidence: the bridge/consume wiring around it is a verbatim copy;
// only the auth library changes.
//
// Key requirements (RESEARCH Pattern 1, Pitfalls 1-2, D-03/D-04/D-06):
//   - DB env-flip (file SQLite local / Turso libSQL deploy) via lib/db.ts.
//   - emailAndPassword enabled for the seeded LIVE-URL login (D-04).
//   - TWO genericOAuth Keycloak entries against the SAME shared `bridge-agnosticism`
//     realm/client: an interactive one (establishes the SSO session) and a silent
//     `prompt: "none"` one for cold-start. Better Auth's `prompt` is config-level,
//     NOT per-request, so the two-entry shape IS the D-06 shared-Keycloak social
//     provider.
//   - advanced.cookies.session_token.name DERIVED from getBetterAuthCookieName (never
//     a hardcoded `__Secure-` literal) so the emitted cookie name matches exactly what
//     the bridge harvests (Pitfall 1 — a mismatch silently yields a signed-out tenant).
//   - nextCookies() LAST in the plugins array (Better Auth docs are explicit).

import { betterAuth } from "better-auth";
import { genericOAuth, keycloak } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import { getBetterAuthCookieName } from "next-auth-bridge";

import { AUTH_PROVIDER_ID_SILENT } from "@/lib/auth-provider";
import { database } from "@/lib/db";

// In production the cookie carries the `__Secure-` prefix; Better Auth does NOT
// add it automatically the way Auth.js does, so we force the exact name below.
const secure = process.env.NODE_ENV === "production";

// The exact name the bridge will harvest. DERIVED from the Phase 7 helper, never a
// hardcoded literal — this closes the dev/prod literal-mismatch trap (AGNOSTIC-05 /
// Pitfall 1). Whatever `secure` is, the emitted cookie name and the harvested name
// stay in lockstep.
const sessionCookieName = getBetterAuthCookieName({ secure });

// Same shared Keycloak realm/client as the Auth.js demo (D-06). The interactive and
// silent entries share clientId/clientSecret/issuer; only providerId + prompt differ.
// pkce: true is REQUIRED — the bridge-example-app Keycloak client mandates PKCE
// (code_challenge_method=S256); the keycloak() helper forwards options.pkce
// verbatim, so omitting it disables PKCE and Keycloak rejects the authz request
// with "Missing parameter: code_challenge_method".
const keycloakClient = {
  clientId: process.env.AUTH_KEYCLOAK_ID ?? "",
  clientSecret: process.env.AUTH_KEYCLOAK_SECRET ?? "",
  issuer: process.env.AUTH_KEYCLOAK_ISSUER ?? "",
  pkce: true,
};

export const auth = betterAuth({
  database,
  // The app's own origin (Better Auth uses BETTER_AUTH_URL, not AUTH_URL).
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Enabled for the deterministic seeded LIVE-URL login (D-04).
  emailAndPassword: { enabled: true },
  plugins: [
    genericOAuth({
      config: [
        // Interactive entry — establishes the shared Keycloak SSO session. The
        // keycloak() helper pins providerId: "keycloak" and derives the discovery
        // URL from the issuer; no prompt override, so a first-time user gets the
        // normal login page.
        keycloak(keycloakClient),
        // Silent entry — SAME Keycloak client, `prompt: "none"`, distinct providerId.
        //
        // NOTE: the keycloak() helper ONLY forwards a fixed field allowlist and
        // hardcodes `providerId: "keycloak"` — it discards any `providerId`/`prompt`
        // passed into it (verified against better-auth@1.6.20's
        // plugins/generic-oauth/providers/keycloak.mjs). So we call the helper for the
        // shared discoveryUrl/scopes/pkce derivation, then OVERRIDE providerId +
        // prompt on the returned config. Without this override both entries collapse
        // to providerId "keycloak" (the CLI's "Duplicate provider IDs" warning) and
        // `prompt=none` never reaches the authz URL — defeating the D-06 cold-start.
        {
          ...keycloak(keycloakClient),
          providerId: AUTH_PROVIDER_ID_SILENT,
          prompt: "none",
        },
      ],
    }),
    // MUST be last (Better Auth docs: integrations/next).
    nextCookies(),
  ],
  advanced: {
    useSecureCookies: secure,
    cookies: {
      session_token: {
        // Derived above — never a hardcoded `__Secure-` literal (Pitfall 1).
        name: sessionCookieName,
        attributes: {
          // CHIPS cross-site handoff requires SameSite=None; Secure; Partitioned.
          sameSite: "none",
          secure: true,
          partitioned: true,
        },
      },
    },
  },
});

// Re-exported so the cookie-name-match test (and lib/auth-bridge.ts) can assert the
// emitted name against getBetterAuthCookieName without reconstructing the branch.
export { sessionCookieName };
