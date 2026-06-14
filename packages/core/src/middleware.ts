// next-auth-bridge — the store-free, crypto-free context-routing middleware.
//
// createBridgeMiddleware answers a UX question only: when a request that is
// already unauthenticated arrives from an embedding host (an iframe), WHERE
// should it be routed? A full-page identity-provider redirect breaks inside an
// iframe, so the middleware rewrites such a request to the popup entry (the URL
// the client sees is unchanged — a rewrite, not a redirect). Every other case —
// a normal browser navigation, an absent/unknown Sec-Fetch-Dest, or any
// authenticated request — passes through so the app's own Auth.js flow handles
// it.
//
// This is NOT a security boundary. It performs no session verification and no
// crypto; the only auth input is the app-supplied, edge-safe `isAuthenticated`
// predicate. A forged Sec-Fetch-Dest header can therefore only change the UX
// target, never grant access — the real gate stays the server-side session
// verifier on the bridge route.
//
// Edge-safety: the module's transitive import graph stays free of the handle
// store, the app session check, Node-only crypto, the Redis adapter, the cookie
// codec, and the package root barrel, so it runs in the Edge runtime. It is
// deliberately NOT wired into createAuthBridge (which carries the store), and it
// takes its OWN lightweight options type rather than AuthBridgeOptions.
//
// It returns a structural routing descriptor rather than a NextResponse, so the
// module pulls no `next` runtime dependency. The app-side wiring maps a
// `{ action: "rewrite" }` descriptor to `NextResponse.rewrite(destination)` and
// `undefined` (passthrough) to `NextResponse.next()`.

/**
 * The structural request surface the middleware reads. A local type (NOT the
 * Next.js `NextRequest`) keeping the module free of a hard framework coupling;
 * a real `NextRequest` is assignable to it.
 */
export interface RequestLike {
  /** Header accessor — returns the value or `null` when absent. */
  headers: { get(name: string): string | null };
  /** The absolute request URL, used to resolve the popup entry path against. */
  url: string;
}

/**
 * The routing decision the middleware returns. `undefined` means passthrough
 * (the app serves the request unchanged); a `rewrite` descriptor names the
 * destination the app-side wiring should `NextResponse.rewrite` to.
 */
export type RouteDecision = { action: "rewrite"; destination: string };

/** The lightweight, edge-safe options for {@link createBridgeMiddleware}. */
export interface BridgeMiddlewareOptions {
  /**
   * The path an unauthenticated embedded request is rewritten to (e.g.
   * `/auth/popup`). Resolved against the incoming request URL.
   */
  popupEntryPath: string;

  /**
   * The app-supplied, edge-safe authentication predicate. Cookie-presence is
   * sufficient here because detection is UX-only — the real gate is the
   * server-side session verifier on the bridge route, not this check.
   */
  isAuthenticated: (req: RequestLike) => boolean;
}

/**
 * Build the context-routing middleware from its options.
 *
 * The returned closure reads `Sec-Fetch-Dest`: an unauthenticated request whose
 * dest is `iframe` is rewritten to the popup entry (URL unchanged); every other
 * case passes through (returns `undefined`). Detection never decides WHETHER to
 * allow content — only WHERE to route an already-unauthenticated request — so a
 * forged signal changes only the UX target, never access.
 *
 * @param options The edge-safe {@link BridgeMiddlewareOptions} (popup entry path
 *   + app-supplied `isAuthenticated`).
 * @returns A `(request) => RouteDecision | undefined` closure.
 */
export function createBridgeMiddleware(
  options: BridgeMiddlewareOptions,
): (request: RequestLike) => RouteDecision | undefined {
  return (request: RequestLike): RouteDecision | undefined => {
    // Authenticated requests always pass through — they already have access, so
    // routing them to the popup entry would be wrong.
    if (options.isAuthenticated(request)) {
      return undefined;
    }

    // UX-only signal: only an embedded (iframe) destination needs the popup
    // entry; a browser nav or an absent/unknown dest passes through so the app's
    // own Auth.js redirect handles the unauthenticated case.
    const dest = request.headers.get("Sec-Fetch-Dest");
    if (dest !== "iframe") {
      return undefined;
    }

    // Resolve the popup entry against the request URL and rewrite to it — the
    // visible URL does not change (this descriptor maps to NextResponse.rewrite,
    // never a redirect).
    const destination = new URL(options.popupEntryPath, request.url).toString();
    return { action: "rewrite", destination };
  };
}
