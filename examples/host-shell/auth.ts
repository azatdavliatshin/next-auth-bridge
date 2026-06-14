// Auth.js v5 configuration for the host-shell.
//
// The host-shell stands in for the enterprise host (SharePoint, Teams, ...). In a
// real deployment that host is itself signed into the organisation's identity
// provider, and the embedded tenant app silent-auths against that EXISTING SSO
// session. To model this faithfully the host-shell authenticates the user FIRST,
// against the SAME Microsoft Entra app registration the tenant app uses (same
// client id, both origins' redirect URIs registered). Signing in here establishes
// the shared Entra SSO session (and consent), so the tenant app's later
// `prompt=none` silent auth completes without a second interactive login.
//
// The host only needs to know the user is signed in — it carries none of the
// tenant app's `tid` plumbing. Secrets come from the environment only (see
// .env.example); nothing real is committed.

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// The multi-tenant + personal-accounts authority. Matches the tenant app's
// default so both sides target the same authority and share the SSO session.
const DEFAULT_ENTRA_ISSUER = "https://login.microsoftonline.com/common/v2.0";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? DEFAULT_ENTRA_ISSUER,
    }),
  ],
});
