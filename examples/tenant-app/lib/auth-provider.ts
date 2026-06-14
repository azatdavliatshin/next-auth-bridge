// Single source of truth for which Auth.js provider the example is wired to.
// NEXT_PUBLIC_ so client components (signIn callsites) and server (auth.ts) agree.
export const AUTH_PROVIDER_ID =
  process.env.NEXT_PUBLIC_AUTH_PROVIDER === "keycloak"
    ? "keycloak"
    : "microsoft-entra-id";
