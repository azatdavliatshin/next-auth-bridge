// The opener-drives-consume seam.
//
// After the popup posts back its one-time opaque handle (the `code`), the
// embedded iframe app exchanges that handle for the partitioned session cookie by
// hitting the package's /auth/consume route. THIS is the single seam where that
// exchange happens — every caller goes through `redeemHandle`, so the transport
// lives in exactly one place.
//
// RESOLVED transport: fetch from inside the iframe with credentials included.
// This was confirmed live — the embedded cross-site iframe reached the signed-in
// state, so the credentialed fetch committed the CHIPS-partitioned cookie under
// the correct (top-level) partition. It also matches the production consume route,
// whose popup branch returns JSON `{ ok: true }` with a Partitioned Set-Cookie
// that the embedded app redeems by fetch. The partition key for a CHIPS cookie is
// the TOP-LEVEL site regardless of who issues the request, so a fetch issued from
// the embedded frame writes the cookie under the correct partition.
//
// A top-level navigation to the same URL is NOT a valid transport: since
// next-auth-bridge@0.3.1 the consume route refuses anything that is not a
// same-origin fetch (THREAT-12). A navigation carrying a valid handle is exactly
// the login-CSRF vector — an attacker's own handle redeemed in a victim's
// browser — so the route reads Fetch Metadata and rejects it before the store.

/**
 * Build the /auth/consume URL carrying the opaque one-time handle and the
 * post-exchange destination. The `code` is an opaque, single-use handle — it
 * appears in this URL exactly like an OAuth authorization code does; the session
 * token is never placed in a URL (the package returns it only as a partitioned
 * Set-Cookie).
 */
function buildConsumeUrl(code: string, next: string): string {
  return `/auth/consume?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
}

/**
 * Exchange the popup's one-time handle for the partitioned session cookie.
 *
 * Resolved transport: fetch from inside the iframe (credentials included,
 * redirects followed). Confirmed live and matching the production consume route.
 *
 * @param code The opaque one-time handle the popup posted back.
 * @param next Where to land after the cookie is set (defaults to "/").
 */
export async function redeemHandle(code: string, next = "/"): Promise<void> {
  const url = buildConsumeUrl(code, next);

  // Fetch from inside the iframe. `credentials: "include"` so the partitioned
  // Set-Cookie is honored; `redirect: "follow"` because /auth/consume answers
  // with a 302 to `next`.
  await fetch(url, { credentials: "include", redirect: "follow" });
}
