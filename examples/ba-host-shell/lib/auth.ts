// Better Auth server config for the host-shell — the simulated enterprise host.
//
// The host stands in for an enterprise host (SharePoint, Teams, ...) that is itself
// signed into the organisation's identity provider. To model this faithfully the
// host authenticates the user FIRST, against the SAME shared `bridge-agnosticism`
// Keycloak realm/client the tenant app uses. Signing in here establishes the
// shared Keycloak SSO session, so the tenant app's later cold-start prompt=none
// silent re-auth (run in the tenant popup, not here) completes without a second
// interactive login.
//
// INTERACTIVE-ONLY: unlike the tenant config there is exactly ONE genericOAuth
// Keycloak entry (no `keycloak-silent`). The host only needs to ESTABLISH the SSO
// session; the silent attempt belongs to the tenant popup.
//
// This is the host analog of examples/host-shell/auth.ts (NextAuth) — same role,
// only the auth library changes. The DB env-flip, derived cookie name, CHIPS
// attributes, and nextCookies()-last discipline mirror the tenant config.

import { betterAuth } from "better-auth";
import { genericOAuth, keycloak } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import { getBetterAuthCookieName } from "next-auth-bridge";

import { database } from "@/lib/db";

const secure = process.env.NODE_ENV === "production";

// The FULL emitted cookie name (with the `__Secure-` prefix in prod), DERIVED from
// the Phase 7 helper — the lockstep discipline as the tenant app (AGNOSTIC-05).
const sessionCookieName = getBetterAuthCookieName({ secure });

// The BASE name handed to Better Auth's cookie config. BA ALWAYS prepends the
// secure prefix itself (createCookieGetter: `${secureCookiePrefix}${name}`), so we
// must pass the UNprefixed base or the cookie double-prefixes to
// `__Secure-__Secure-...` and the bridge harvest never matches (Pitfall 1).
const sessionCookieConfigName = getBetterAuthCookieName({ secure: false });

// Same shared Keycloak realm/client as the tenant app and the Auth.js demo (D-06).
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
  // The host's own origin (Better Auth uses BETTER_AUTH_URL, not AUTH_URL).
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Enabled for the deterministic seeded LIVE-URL login (D-04), mirroring the tenant.
  emailAndPassword: { enabled: true },
  plugins: [
    genericOAuth({
      config: [
        // Interactive entry — establishes the shared Keycloak SSO session. The
        // keycloak() helper pins providerId: "keycloak" and derives the discovery
        // URL from the issuer; no prompt override, so the user gets the normal
        // login page. The host carries NO `keycloak-silent` entry — that is the
        // tenant popup's cold-start concern.
        keycloak(keycloakClient),
      ],
    }),
    // MUST be last (Better Auth docs: integrations/next).
    nextCookies(),
  ],
  advanced: {
    useSecureCookies: secure,
    cookies: {
      session_token: {
        // BASE name — Better Auth adds the `__Secure-` prefix itself (Pitfall 1:
        // passing the prefixed name here double-prefixes and breaks the harvest).
        name: sessionCookieConfigName,
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

// Re-exported so any test or helper can assert the emitted name against
// getBetterAuthCookieName without reconstructing the branch.
export { sessionCookieName };
