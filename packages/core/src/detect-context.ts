// next-auth-bridge — the client-side context detector.
//
// detectContext answers a UX question only: is this document running inside an
// embedding host (an iframe) or as a normal top-level browser tab? It is NOT a
// security boundary — the real auth gate is the server-side session verifier, so
// a wrong or unknown answer here can only mis-route UX, never grant access.
//
// It is a bare exported function (no class, no factory) with an injected-default
// `win`, mirroring the injectable-clock seam used elsewhere in the package, so
// tests pass a fake window-like with no real global `window`.

/**
 * The client execution contexts the bridge UX can route on.
 *
 * This union is INTENTIONALLY OPEN: it already names a member (`pwa-shell`) that
 * v0.1 never returns, and it may gain further members in a future minor without
 * a breaking change. Consumers MUST therefore handle the cases they know and
 * default the rest (if/else with a default branch) — NEVER an exhaustive
 * `switch` with a never-assertion, which would turn a future member into a
 * compile error at the call site and make the union effectively closed.
 */
export type BridgeContext = "iframe" | "browser" | "pwa-shell";

/**
 * The structural shape detectContext reads from a window. A local type (NOT the
 * DOM `Window`) keeping the detector free of a hard DOM-lib coupling; the real
 * `window` is assignable to it.
 */
interface WindowLike {
  self: unknown;
  top: unknown;
}

/**
 * Detect whether the document is embedded (iframe) or top-level (browser).
 *
 * Two signals, both meaning "embedded":
 * 1. `win.self !== win.top` — the document's own window is not the topmost
 *    window, so it is nested in a frame.
 * 2. Accessing `win.top` THROWS — a cross-origin parent makes the `top`
 *    reference unreadable (a SecurityError). The throw itself confirms embedding,
 *    so it is caught and treated as `'iframe'` rather than propagated.
 *
 * Otherwise (self is top, no throw) the document is a normal top-level tab.
 *
 * @param win The window to inspect (injected; defaults to the ambient global —
 *   the browser `window`, reached via `globalThis` so this module needs no DOM
 *   lib). Tests pass a fake window-like so no real global is needed.
 */
export function detectContext(
  win: WindowLike = globalThis as unknown as WindowLike,
): BridgeContext {
  try {
    return win.self !== win.top ? "iframe" : "browser";
  } catch {
    // A cross-origin `top` access throws — being unable to read `top` is itself
    // proof of an embedding (cross-origin) parent.
    return "iframe";
  }
}

/**
 * Route a detected context to a UX entry decision, demonstrating the open-union
 * default-fallback contract: known members are handled explicitly and every
 * other (current OR future) member falls through to the safe `"normal"` default.
 * Implemented with if/else — deliberately NOT an exhaustive switch — so a future
 * `BridgeContext` member compiles and routes safely without code changes.
 */
export function routeForContext(ctx: BridgeContext): "popup-entry" | "normal" {
  if (ctx === "iframe") return "popup-entry";
  return "normal";
}
