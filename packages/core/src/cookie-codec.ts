// next-auth-bridge — hand-rolled cookie codec (parse incoming Cookie / serialize Set-Cookie).
//
// D-03 (incoming Cookie header reality): a server reading the request's `Cookie`
// header gets ONLY `name=value` pairs — browsers never echo back Secure /
// SameSite / Max-Age. parseCookieHeader therefore captures name+value only; the
// security attributes are RECONSTRUCTED on the way out, never chased from the
// request.
//
// D-05 (chunk harvesting): harvestSessionChunks selects every cookie matching
// the resolved Auth.js session-token base — the exact base name OR base + "." +
// integer suffix (the `.0` / `.1` chunks of an oversized JWT). It deliberately
// does NOT sweep csrf / pkce / state / callback-url cookies (Pitfall 2/3) — an
// over-broad match would break Auth.js-managed PKCE (ROUTE-04) and leak
// unrelated state.
//
// D-02 / D-17 (Set-Cookie hardened floors): serializeSetCookie emits a fixed,
// CHIPS-compliant attribute set on every chunk — Path=/, Secure, HttpOnly,
// SameSite=None, Partitioned. Secure is mandatory for Partitioned to be honored
// by browsers; SameSite=None + Path=/ are the cross-context requirements.
// Max-Age is OMITTED by default (D-17 → session-scoped) and appended only when
// an explicit maxAge override is supplied (the source Max-Age is not capturable
// from the incoming request — D-03 — so it is never guessed).
//
// Zero new runtime dependencies (RESEARCH): the surface is narrow enough to
// hand-roll and keep fully auditable in-repo, matching Phase 1's zero-dep ethos.

/**
 * Parse an incoming `Cookie` header into a name → value map.
 *
 * Per RFC 6265 the header is `name=value; name2=value2`; browsers send only
 * name=value pairs (D-03). Splits on ";", then on the FIRST "=" of each pair
 * (cookie values may legitimately contain "="), trims, and skips malformed
 * parts (no "=", or an empty name). Returns an empty map for a null/empty
 * header.
 */
export function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}

/**
 * Harvest every Auth.js session-token cookie chunk from a parsed cookie map (D-05).
 *
 * Matches the exact `base` name OR `base + "." + <integer>` (the `.0` / `.1`
 * chunk suffixes of an oversized JWT). The integer-suffix guard prevents an
 * over-broad prefix match from sweeping unrelated cookies (Pitfall 2). Chunk
 * names are preserved verbatim — consume re-sets each one as-is (D-01), so no
 * reassembly is required here.
 *
 * @param cookies The parsed incoming cookies (from {@link parseCookieHeader}).
 * @param base The resolved session-token base name (from `getAuthCookieName`).
 */
export function harvestSessionChunks(
  cookies: Map<string, string>,
  base: string,
): Array<{ name: string; value: string }> {
  const chunks: Array<{ name: string; value: string }> = [];
  for (const [name, value] of cookies) {
    if (
      name === base ||
      (name.startsWith(base + ".") &&
        /^\d+$/.test(name.slice(base.length + 1)))
    ) {
      chunks.push({ name, value });
    }
  }
  return chunks;
}

/**
 * Serialize a single CHIPS-partitioned `Set-Cookie` header value with the
 * hardened-floor attribute set (D-02): `Path=/; Secure; HttpOnly;
 * SameSite=None; Partitioned`.
 *
 * `Max-Age` is appended ONLY when `opts.maxAge != null` (D-17). Omitted by
 * default → a session-scoped cookie, the conservative correct-by-default
 * behavior for a transient handoff; the source lifetime is not capturable from
 * the incoming request (D-03), so it is never guessed.
 *
 * Each chunk must be emitted as its OWN `Set-Cookie` header via
 * `Headers.append("Set-Cookie", …)` — Set-Cookie is special-cased by the Fetch
 * API and must never be comma-joined.
 */
export function serializeSetCookie(
  name: string,
  value: string,
  opts: { maxAge?: number },
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    "Secure",
    "HttpOnly",
    "SameSite=None",
    "Partitioned",
  ];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}
