// Auth.js v5 configuration for the reference tenant app.
//
// One multi-tenant Microsoft Entra registration serves every tenant: the
// provider points at the `/common` endpoint (multi-tenant + personal accounts),
// and the tenant a user belongs to is read from the token's `tid` claim. Secrets
// are supplied through the environment only (see .env.example) — nothing real is
// committed.

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Keycloak from "next-auth/providers/keycloak";

import { AUTH_PROVIDER_ID } from "@/lib/auth-provider";

// The multi-tenant + personal-accounts authority. When the issuer env var is
// unset we fall back to this default so a fresh checkout still points at the
// multi-tenant endpoint rather than a single tenant.
const DEFAULT_ENTRA_ISSUER = "https://login.microsoftonline.com/common/v2.0";

// Keycloak has no Entra `tid` claim, so a Keycloak demo user is collapsed onto a
// single fixed tenant. The slug must match a configured DEMO_TENANTS entry on the
// /t/[tenant] page so its membership assertion (tid === tenant) passes.
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? "demo";

// Build the active provider from the env switch. Keycloak is the public-demo
// provider (anyone can sign in with the seeded test user); Entra is the default
// and keeps the enterprise narrative intact. Both example apps must point at the
// SAME Keycloak realm/client so the host's sign-in establishes the SSO session
// the popup silently reuses.
const activeProvider =
  AUTH_PROVIDER_ID === "keycloak"
    ? Keycloak({
        clientId: process.env.AUTH_KEYCLOAK_ID,
        clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
        issuer: process.env.AUTH_KEYCLOAK_ISSUER,
      })
    : MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
        // Multi-tenant + personal accounts. Override via env for a single-tenant
        // or work/school-only deployment.
        issuer:
          process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? DEFAULT_ENTRA_ISSUER,
      });

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
  providers: [activeProvider],
  // Route Auth.js OAuth errors to /auth/popup so a silent prompt=none failure
  // (login_required = no host SSO) lands on ?error=... and renders the popup's
  // own "sign in to the host first" notice instead of Auth.js's default error
  // page. A top-level standalone sign-in error also lands here, which already
  // renders a sane top-level notice — acceptable for the example app.
  pages: { error: "/auth/popup" },
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
      } else if (
        AUTH_PROVIDER_ID === "keycloak" &&
        typeof (token as Record<string, unknown>)["tid"] !== "string"
      ) {
        // Keycloak carries no Entra `tid` claim, so every Keycloak user resolves
        // to the single fixed demo tenant. Set it once (only when no tid is yet
        // present) so the /t/[tenant] membership assertion passes.
        (token as Record<string, unknown>)["tid"] = DEMO_TENANT_ID;
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
