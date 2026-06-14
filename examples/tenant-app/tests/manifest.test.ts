// Negative-case suite for the dynamic per-tenant manifest route.
//
// This route is the v0.2 PWA installation entry point's data source. Its
// correctness properties (and the regressions they guard against) mirror the
// package's own negative-case discipline:
//
//   media type: the response MUST carry `application/manifest+json` — a
//     regression to `application/json` (the trap when someone reaches for
//     NextResponse.json()) fails this suite.
//   per-tenant: the parsed body for a tenant references that tenant in its
//     name/start_url/scope — the path segment actually shapes the manifest.
//   per-request: two distinct tenants never return an identical body, and the
//     module is marked force-dynamic so the route is computed per request and
//     never served from a stale cache.
//
// The handler is driven directly with a plain Request and a synthesized
// `{ params: Promise.resolve({ tenant }) }` (Next 16 async params) — no Next.js
// runtime, runs on the Node bench.

import { describe, expect, it } from "vitest";

import { GET, dynamic } from "@/app/t/[tenant]/manifest.webmanifest/route";

/** Drive the exported GET for one tenant, mirroring Next's async-params shape. */
function getManifest(tenant: string): Promise<Response> {
  return GET(new Request(`https://app.test/t/${tenant}/manifest.webmanifest`), {
    params: Promise.resolve({ tenant }),
  });
}

describe("per-tenant manifest route", () => {
  it("serves the application/manifest+json media type (NOT application/json)", async () => {
    const res = await getManifest("acme");
    expect(res.headers.get("Content-Type")).toBe("application/manifest+json");
  });

  it("reflects the tenant into the manifest name/start_url/scope", async () => {
    const res = await getManifest("acme");
    const body = (await res.json()) as {
      name: string;
      start_url: string;
      scope: string;
    };
    expect(body.name).toContain("acme");
    expect(body.start_url).toBe("/t/acme");
    expect(body.scope).toBe("/t/acme");
  });

  it("returns DIFFERENT bodies for two distinct tenants (per-tenant guard)", async () => {
    const acme = await (await getManifest("acme")).text();
    const globex = await (await getManifest("globex")).text();
    expect(acme).not.toBe(globex);
  });

  it("is marked force-dynamic so it is computed per request, not cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
