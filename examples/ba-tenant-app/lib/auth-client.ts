// Better Auth client — replaces the Auth.js `next-auth/react` `signIn` surface.
// The genericOAuthClient plugin exposes `authClient.signIn.oauth2({ providerId, ... })`,
// which the popup page uses for the cold-start silent attempt against the
// `keycloak-silent` config entry (RESEARCH Pattern 4).
import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
