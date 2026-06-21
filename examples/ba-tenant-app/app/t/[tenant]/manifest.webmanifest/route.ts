// Dynamic per-tenant web app manifest.
//
// Each path-based tenant (/t/<tenant>) gets its own manifest whose name,
// start_url, and scope are derived from the tenant segment, so an installed PWA
// always opens scoped to the correct tenant. The route is computed per request
// (force-dynamic) — never served from a stale cache that could leak one
// tenant's manifest to another.
//
// The body is emitted as a raw Response with an explicit
// `application/manifest+json` Content-Type — the media type the Web App
// Manifest spec requires. We deliberately do NOT use NextResponse.json(), which
// would set `application/json` and serve a manifest the browser may refuse.

// Per-request, not cached: per-tenant correctness requires fresh computation.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenant: string }> },
): Promise<Response> {
  // Next 16 hands route params as a Promise — await before use.
  const { tenant } = await params;

  const body = {
    name: `${tenant} — next-auth-bridge example`,
    short_name: tenant,
    start_url: `/t/${tenant}`,
    scope: `/t/${tenant}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: `/t/${tenant}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `/t/${tenant}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
