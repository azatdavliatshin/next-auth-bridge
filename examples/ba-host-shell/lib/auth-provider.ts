// Single source of truth for the interactive Better Auth genericOAuth provider id
// the host-shell is wired to. Mirrors the tenant app's auth-provider single-source
// idiom; the host pins Keycloak (the shared `bridge-agnosticism` realm) as its
// provider, so the value is a fixed constant rather than an env switch.
//
// The host is INTERACTIVE-ONLY — it establishes the shared SSO session the
// embedded tenant app's popup later silently reuses. There is no `keycloak-silent`
// entry here: the cold-start prompt=none attempt runs in the tenant popup, not the
// host.
export const AUTH_PROVIDER_ID = "keycloak";
