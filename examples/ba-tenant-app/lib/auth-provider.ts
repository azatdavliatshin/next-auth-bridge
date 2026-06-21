// Single source of truth for the interactive Better Auth genericOAuth provider id
// the example is wired to. Mirrors the Auth.js set's auth-provider single-source
// idiom; here the Better Auth example pins Keycloak (the shared `bridge-agnosticism`
// realm) as its provider, so the value is a fixed constant rather than an env switch.
//
// The cold-start silent re-auth uses a SEPARATE provider entry (AUTH_PROVIDER_ID_SILENT)
// because Better Auth's `prompt` is config-level, not per-request (D-06): one entry
// establishes the session interactively, the other carries `prompt: "none"`.
export const AUTH_PROVIDER_ID = "keycloak";
export const AUTH_PROVIDER_ID_SILENT = "keycloak-silent";
