"use client";

// The host-shell's sign-in / sign-out controls (Better Auth client side).
//
// The Auth.js host used server-action forms calling signIn/signOut from "@/auth".
// Better Auth's interactive genericOAuth sign-in runs through the client surface
// (authClient.signIn.oauth2), so the host's auth controls are a small client
// component. Signing in here establishes the shared Keycloak SSO session the
// embedded tenant app's popup later silently reuses (a normal interactive login —
// the host is INTERACTIVE-ONLY; there is no prompt=none here).

import { authClient } from "@/lib/auth-client";
import { AUTH_PROVIDER_ID } from "@/lib/auth-provider";

export function HostSignInButton(): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() =>
        void authClient.signIn.oauth2({
          providerId: AUTH_PROVIDER_ID,
          callbackURL: "/",
        })
      }
    >
      Sign in to the host
    </button>
  );
}

export function HostSignOutButton(): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() =>
        void authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              window.location.assign("/");
            },
          },
        })
      }
    >
      Sign out of the host
    </button>
  );
}
