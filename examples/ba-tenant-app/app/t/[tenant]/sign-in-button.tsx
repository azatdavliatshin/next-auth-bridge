"use client";

// The per-tenant landing page's sign-in control — context-aware.
//
// The tenant app is a STANDALONE app that also happens to be embeddable:
//
//   - TOP-LEVEL (visited directly, not in a frame): an ordinary interactive
//     sign-in — a full-page redirect to the identity provider that sets the
//     first-party session directly. This is how the user establishes a tenant
//     session, and it is what the embedded popup later READS. (Better Auth analog
//     of the Auth.js `signIn` call: authClient.signIn.oauth2.)
//
//   - EMBEDDED (cross-site iframe inside a host): the browser blocks ordinary
//     third-party cookies, so a plain sign-in cannot set a session here. Sign-in
//     must go through the popup bridge (openAuthPopup -> redeemHandle), shared
//     with the in-iframe popup entry via SignInLauncher.
//
// The context is a client-only determination (it reads window), so this is a
// client component. The embedded branch (SignInLauncher) is the verbatim agnostic
// core; only the top-level interactive call is the auth-library delta.

import { useEffect, useState } from "react";
import { SignInLauncher } from "../../auth/sign-in-launcher";
import { authClient } from "@/lib/auth-client";
import { AUTH_PROVIDER_ID } from "@/lib/auth-provider";

// Embedded in a frame, or a real top-level document? A cross-origin `top` access
// throws — which itself confirms embedding.
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function SignInButton(): React.JSX.Element {
  // undefined until the effect inspects window on the client.
  const [embedded, setEmbedded] = useState<boolean | undefined>(undefined);
  useEffect(() => setEmbedded(isEmbedded()), []);

  if (embedded === undefined) {
    return (
      <button type="button" disabled>
        Sign in
      </button>
    );
  }

  // Embedded: cross-site cookies are blocked → go through the popup bridge.
  if (embedded) {
    return <SignInLauncher />;
  }

  // Top-level standalone app: a normal identity-provider sign-in (full-page
  // redirect). This sets the first-party tenant session that the embedded popup
  // will later read.
  return (
    <button
      type="button"
      onClick={() =>
        void authClient.signIn.oauth2({
          providerId: AUTH_PROVIDER_ID,
          callbackURL: window.location.pathname,
        })
      }
    >
      Sign in
    </button>
  );
}
