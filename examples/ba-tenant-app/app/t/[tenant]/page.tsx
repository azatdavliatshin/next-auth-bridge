// Per-tenant landing page — the legible face of the cross-context handoff.
//
// This SSR page reads the Better Auth session on the server and renders, clean and
// minimal, four things for whichever tenant the path segment names:
//   - which tenant is active (the /t/[tenant] segment),
//   - whether the visitor is signed in or out,
//   - the handle-exchange / session state,
//   - inline copy explaining WHY the bridge exists.
//
// This is the Better Auth analog of examples/tenant-app/app/t/[tenant]/page.tsx —
// same role, only the auth library changes: the SSR session read is Better Auth's
// getSession (the Auth.js analog was () => auth()). Unlike the Auth.js demo, the
// Better Auth config carries no Entra `tid` plumbing (the demo collapses Keycloak
// users onto a single fixed tenant), so the `tid` claim is simply absent from the
// session and the page reports it as "unknown".
//
// When signed out it renders the opener button (the popup-bridge entry). The demo
// ships two concrete tenants; the dynamic segment drives per-tenant identity.

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { SignInButton } from "./sign-in-button";

// The concrete tenant set this reference app demonstrates. Two path-based tenants
// is the minimum that proves per-tenant routing; the segment is the tenant key.
const DEMO_TENANTS: Record<string, { label: string }> = {
  // The public-demo tenant. Keycloak users carry no Entra `tid` claim, so this
  // demo collapses them onto a single fixed tenant id ("demo").
  demo: { label: "Demo Tenant" },
  acme: { label: "Acme Corp" },
  globex: { label: "Globex Corporation" },
};

// Read the tenant id (`tid`) a session would surface. Typed structurally so the
// strict build stays clean. Better Auth's session carries no `tid` claim in this
// demo, so this returns undefined and the page reports "unknown".
function sessionTenantId(session: unknown): string | undefined {
  if (session && typeof session === "object") {
    const tid = (session as Record<string, unknown>)["tid"];
    if (typeof tid === "string" && tid.length > 0) return tid;
  }
  return undefined;
}

export default async function TenantPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<React.JSX.Element> {
  const { tenant } = await params;
  const known = DEMO_TENANTS[tenant];
  const session = await auth.api.getSession({ headers: await headers() });
  const signedIn = session?.user != null;
  const tokenTenant = sessionTenantId(session);

  // The page links the token-asserted tenant to the requested route: does the
  // tid claim the user signed in under match the tenant whose page they opened?
  const tenantMatches =
    signedIn && tokenTenant != null ? tokenTenant === tenant : undefined;

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", lineHeight: 1.5 }}>
      <p
        style={{
          display: "inline-block",
          padding: "0.25rem 0.6rem",
          borderRadius: "0.375rem",
          border: "1px solid #2563eb",
          color: "#2563eb",
          fontWeight: 600,
          fontSize: "0.85rem",
          letterSpacing: "0.02em",
        }}
      >
        Better Auth
      </p>

      <h1>{known ? known.label : tenant}</h1>
      <p>
        Tenant route: <code>/t/{tenant}</code>
        {known ? null : " (not a configured demo tenant)"}
      </p>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: "1rem 1.25rem",
          margin: "1.5rem 0",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Session</h2>
        <p>
          Status: <strong>{signedIn ? "signed in" : "signed out"}</strong>
        </p>
        {signedIn ? (
          <>
            <p>
              Token tenant (<code>tid</code> claim):{" "}
              <code>{tokenTenant ?? "(not present)"}</code>
            </p>
            <p>
              Matches requested tenant:{" "}
              <strong>
                {tenantMatches === undefined
                  ? "unknown (no tid on session)"
                  : tenantMatches
                    ? "yes — the signed-in directory matches this route"
                    : "no — signed into a different tenant than this route"}
              </strong>
            </p>
          </>
        ) : (
          <>
            <p>
              Not signed in. Sign in below — visited directly this app signs you
              in straight against the identity provider; embedded as a cross-site
              iframe it routes sign-in through the popup bridge instead.
            </p>
            <SignInButton />
          </>
        )}
      </section>

      <section style={{ color: "#444", fontSize: "0.95rem" }}>
        <h2>Why this bridge exists</h2>
        <p>
          This page is meant to run <em>embedded as a cross-site iframe</em>{" "}
          inside a separate enterprise host. Because the host and this app are
          different sites, the browser blocks ordinary third-party cookies, so a
          plain sign-in inside the frame cannot set a session.
        </p>
        <p>
          The bridge solves this in three hops: signing in opens a{" "}
          <strong>top-level popup</strong> (where the identity-provider session is
          reachable), the popup posts back a <strong>one-time code</strong> over a
          trusted message, and this frame exchanges that code for a{" "}
          <strong>partitioned cookie</strong> — a cookie scoped to the top-level
          site, which the browser does allow. No session token ever travels in a
          URL; only the opaque one-time code does.
        </p>
      </section>
    </main>
  );
}
