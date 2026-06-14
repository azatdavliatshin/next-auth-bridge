// Auth.js v5 configuration for the reference tenant app.
//
// One multi-tenant Microsoft Entra registration serves every tenant: the
// provider points at the `/common` endpoint (multi-tenant + personal accounts),
// and the tenant a user belongs to is read from the token's `tid` claim. Secrets
// are supplied through the environment only (see .env.example) — nothing real is
// committed.

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// The multi-tenant + personal-accounts authority. When the issuer env var is
// unset we fall back to this default so a fresh checkout still points at the
// multi-tenant endpoint rather than a single tenant.
const DEFAULT_ENTRA_ISSUER = "https://login.microsoftonline.com/common/v2.0";

/**
 * Read the Entra tenant id (`tid`) for the signed-in account.
 *
 * The claim is normally present on the OIDC `profile` object. If a given token
 * shape does not surface it there, we decode it from the `id_token` JWT payload
 * as a fallback. Both inputs are typed structurally (no `any`) so the strict
 * build stays clean.
 */
function readTenantId(
  profile: Record<string, unknown> | undefined,
  idToken: string | undefined,
): string | undefined {
  const fromProfile = profile?.["tid"];
  if (typeof fromProfile === "string" && fromProfile.length > 0) {
    return fromProfile;
  }

  if (idToken) {
    const claims = decodeJwtClaims(idToken);
    const fromToken = claims?.["tid"];
    if (typeof fromToken === "string" && fromToken.length > 0) {
      return fromToken;
    }
  }

  return undefined;
}

/**
 * Decode the (unverified) claims set of a JWT's payload segment.
 *
 * Signature verification is owned by Auth.js during the OIDC exchange; here we
 * only need to read an already-validated token's `tid` claim, so a plain
 * base64url decode of the middle segment is sufficient and intentionally does no
 * verification of its own.
 */
function decodeJwtClaims(
  jwt: string,
): Record<string, unknown> | undefined {
  const segments = jwt.split(".");
  const payload = segments[1];
  if (!payload) return undefined;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed token simply yields no tenant id — never throw here.
  }
  return undefined;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Multi-tenant + personal accounts. Override via env for a single-tenant
      // or work/school-only deployment.
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? DEFAULT_ENTRA_ISSUER,
    }),
  ],
  callbacks: {
    jwt({ token, account, profile }) {
      // Capture the tenant id once at sign-in and carry it on the token so the
      // session callback (and the app) can read it on every request.
      const tid = readTenantId(
        profile as Record<string, unknown> | undefined,
        account?.id_token,
      );
      if (tid) {
        (token as Record<string, unknown>)["tid"] = tid;
      }
      return token;
    },
    session({ session, token }) {
      // Surface the tenant id on the session so a /t/[tenant] page can assert the
      // signed-in user belongs to the tenant it is rendering.
      const tid = (token as Record<string, unknown>)["tid"];
      if (typeof tid === "string") {
        (session as unknown as Record<string, unknown>)["tid"] = tid;
      }
      return session;
    },
  },
});
