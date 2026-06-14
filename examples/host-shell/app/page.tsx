// The host-shell home page — the simulated enterprise host, behind its own auth.
//
// This page stands in for a real enterprise host (SharePoint, a Teams Tab,
// Salesforce Lightning, ServiceNow, ...) that embeds a third-party app in an
// iframe. Two crucial properties make the demonstration faithful:
//
//   1. The host is a SEPARATE site from the tenant app: two distinct *.vercel.app
//      origins are cross-site under the Public Suffix List, so the embedded tenant
//      app is genuinely third-party. That is what forces the popup-bridge +
//      partitioned-cookie path — a same-origin host would let ordinary cookies
//      through and make the whole demonstration hollow.
//
//   2. The host is itself AUTHENTICATED against the identity provider, against the
//      SAME Microsoft Entra app registration the tenant app uses. Signing in here
//      establishes the shared Entra SSO session (and consent). Only after the host
//      is signed in does it render the embedded iframe — so when the user signs in
//      inside the frame, the bridge popup can mint the tenant session via a SILENT
//      `prompt=none` auth that leverages this existing SSO, with no second
//      interactive login and no Cross-Origin-Opener-Policy severance.
//
// Server component: it reads the session and runs sign-in via a server action, so
// there is no client-side identity-provider popup here.

import { auth, signIn, signOut } from "@/auth";
import { AUTH_PROVIDER_ID } from "@/lib/auth-provider";

// The tenant app's origin to embed. In a real deploy NEXT_PUBLIC_APP_ORIGIN is
// the tenant app's https origin; locally it falls back to a sensible dev origin.
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://your-app.vercel.app";

// Embed the "demo" tenant landing page concretely so the roundtrip is visible
// end to end. "demo" is the public-demo tenant: Keycloak users resolve to this
// fixed tenant id (DEMO_TENANT_ID), so the embedded app's membership check passes.
const EMBEDDED_TENANT_PATH = "/t/demo";

export default async function HostShellPage(): Promise<React.JSX.Element> {
  const session = await auth();
  const signedIn = session?.user != null;
  const iframeSrc = `${APP_ORIGIN}${EMBEDDED_TENANT_PATH}`;

  return (
    <main style={{ maxWidth: 880, margin: "2rem auto", lineHeight: 1.5 }}>
      <h1>Enterprise host (simulated)</h1>
      <p style={{ color: "#444" }}>
        This page is a stand-in for an enterprise host on its own origin. Like a
        real host, it is signed into the identity provider first; only then does it
        embed the tenant app as a <strong>cross-site iframe</strong>. Because the
        two origins differ, the browser treats the framed app as third-party and
        blocks ordinary cookies — so signing in there has to go through the bridge.
      </p>

      {!signedIn ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "1rem 1.25rem",
            margin: "1.5rem 0",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Host sign-in required</h2>
          <p>
            Sign in to the host first. This establishes the shared Entra SSO
            session (and consent) against the same app registration the tenant app
            uses — which is what lets the embedded app&apos;s bridge popup complete
            silently, with no second interactive login.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn(AUTH_PROVIDER_ID, { redirectTo: "/" });
            }}
          >
            <button type="submit">Sign in to the host</button>
          </form>
        </section>
      ) : (
        <>
          <ol style={{ color: "#444" }}>
            <li>
              The iframe below is the embedded tenant app (a separate origin).
            </li>
            <li>
              Clicking <em>Sign in</em> inside it opens a <strong>top-level
              popup</strong>, which silent-auths against this host&apos;s existing
              identity-provider session.
            </li>
            <li>
              The popup hands a one-time code back to the frame, which exchanges it
              for a <strong>partitioned cookie</strong> — and the iframe then shows
              as signed in.
            </li>
          </ol>

          <iframe
            src={iframeSrc}
            title="Embedded tenant app (cross-site)"
            style={{
              width: "100%",
              height: 560,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          />

          <p style={{ color: "#777", fontSize: "0.85rem" }}>
            Embedding <code>{iframeSrc}</code>
          </p>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit">Sign out of the host</button>
          </form>
        </>
      )}
    </main>
  );
}
