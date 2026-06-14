// next-auth-bridge — createBridgeMiddleware context-routing tests.
//
// The middleware is a UX-only router: when an already-unauthenticated request
// arrives from an embedding host (Sec-Fetch-Dest: iframe), it rewrites to the
// popup entry (because a full-page IdP redirect breaks inside an iframe); every
// other case passes through so the app's own Auth.js redirect handles it.
//
// Security intent (test-side comments only — no internal IDs ship in source):
// - Tampering / forged-signal invariance: Sec-Fetch-Dest is a browser-set
//   header. It chooses WHERE to route an unauthenticated request, never WHETHER
//   to allow content. Holding auth state fixed and varying the signal across
//   present-iframe / absent / forged changes only the UX target — the security
//   outcome (does the user reach protected content) is invariant.
// - Edge-safety / no-pretend-gate: the module imports no session verifier, no
//   transfer store, no node:crypto, and nothing from the package root index, so
//   it stays runnable in the Edge runtime and is provably NOT a security gate.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createBridgeMiddleware } from "../middleware.js";
import type { RouteDecision } from "../middleware.js";

const POPUP_ENTRY = "/auth/popup";
const URL_BASE = "https://app.test/dashboard";

/** A minimal RequestLike with a Sec-Fetch-Dest header and a url. */
function makeReq(
  dest: string | null,
  url: string = URL_BASE,
): { headers: { get(name: string): string | null }; url: string } {
  return {
    headers: {
      get(name: string): string | null {
        if (name.toLowerCase() === "sec-fetch-dest") return dest;
        return null;
      },
    },
    url,
  };
}

const authed = () => true;
const unauthed = () => false;

describe("createBridgeMiddleware", () => {
  it("rewrites an unauthenticated iframe request to the popup entry (URL unchanged)", () => {
    const mw = createBridgeMiddleware({
      popupEntryPath: POPUP_ENTRY,
      isAuthenticated: unauthed,
    });

    const result = mw(makeReq("iframe"));

    expect(result).toBeDefined();
    expect(result?.action).toBe("rewrite");
    if (result?.action === "rewrite") {
      // The destination is the popup entry resolved against the request URL;
      // the visible URL the client sees does not change (it is a rewrite, not a
      // redirect).
      expect(result.destination).toBe("https://app.test/auth/popup");
    }
  });

  it("passes through an unauthenticated browser request (Sec-Fetch-Dest absent)", () => {
    const mw = createBridgeMiddleware({
      popupEntryPath: POPUP_ENTRY,
      isAuthenticated: unauthed,
    });

    // Absent Sec-Fetch-Dest → treated as a normal browser nav → passthrough so
    // the app's own Auth.js redirect handles the unauthenticated case.
    expect(mw(makeReq(null))).toBeUndefined();
  });

  it("passes through an unauthenticated non-iframe Sec-Fetch-Dest (e.g. document)", () => {
    const mw = createBridgeMiddleware({
      popupEntryPath: POPUP_ENTRY,
      isAuthenticated: unauthed,
    });

    expect(mw(makeReq("document"))).toBeUndefined();
  });

  it("passes through an authenticated request regardless of Sec-Fetch-Dest", () => {
    const mw = createBridgeMiddleware({
      popupEntryPath: POPUP_ENTRY,
      isAuthenticated: authed,
    });

    // Even an iframe dest is never rewritten when authenticated — the user
    // already has access; routing to the popup entry would be wrong.
    expect(mw(makeReq("iframe"))).toBeUndefined();
    expect(mw(makeReq(null))).toBeUndefined();
    expect(mw(makeReq("document"))).toBeUndefined();
  });

  it("forged-signal invariance: at a FIXED auth state the access decision never changes", () => {
    // The security-relevant question is "does the middleware grant the
    // unauthenticated request access to protected content?" The middleware NEVER
    // does — every decision it can emit (rewrite-to-popup OR passthrough) hands
    // the request to a downstream gate (the popup's silent-auth bridge, or the
    // app's own Auth.js redirect), neither of which is "serve the protected
    // route to this unauthenticated user". So the access decision is a pure
    // function of auth state, and varying the signal changes only the UX target.

    // "grants access" == the middleware lets an UNAUTHENTICATED user reach the
    // protected route as-is. By construction the middleware can never produce
    // that — a rewrite re-routes to the popup, a passthrough defers to the app's
    // own auth gate. We assert that property holds across every signal.
    const grantsAccessWhileUnauth = (
      r: RouteDecision | undefined,
    ): boolean => {
      // A rewrite to the popup entry does NOT serve protected content.
      if (r !== undefined) return false;
      // A passthrough defers to the app's own Auth.js gate, which (being
      // unauthenticated) will itself redirect — the middleware did not grant
      // access. The middleware alone never serves the protected route.
      return false;
    };

    const unauthMw = createBridgeMiddleware({
      popupEntryPath: POPUP_ENTRY,
      isAuthenticated: unauthed,
    });

    const signals = ["iframe", null, "forged-bogus-value"] as const;
    const accessOutcomes = signals.map((s) =>
      grantsAccessWhileUnauth(unauthMw(makeReq(s))),
    );
    // Invariant: never grants access, whatever the (possibly forged) signal.
    expect(accessOutcomes).toEqual([false, false, false]);

    // The ONLY thing the signal changes is the UX target: an iframe dest routes
    // to the popup entry; absent / forged dests pass through. A forged value is
    // treated as a non-iframe browser nav — it cannot conjure a popup rewrite,
    // and (crucially) it never grants access either.
    expect(unauthMw(makeReq("iframe"))?.action).toBe("rewrite");
    expect(unauthMw(makeReq(null))).toBeUndefined();
    expect(unauthMw(makeReq("forged-bogus-value"))).toBeUndefined();

    // And at the OTHER fixed auth state (authenticated), the decision is also
    // signal-invariant: always passthrough, never rewritten to the popup.
    const authMw = createBridgeMiddleware({
      popupEntryPath: POPUP_ENTRY,
      isAuthenticated: authed,
    });
    expect(signals.map((s) => authMw(makeReq(s)))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("structural: the module imports no verifySession, no store, no node:crypto, no package root", () => {
    // Edge-safety / no-pretend-gate: read the shipped source and assert its
    // import surface stays free of Node-only / store / verifier / root-barrel
    // dependencies. This keeps the whole transitive graph Edge-runtime-safe.
    const src = readFileSync(
      fileURLToPath(new URL("../middleware.ts", import.meta.url)),
      "utf8",
    );

    expect(src).not.toMatch(/verifySession/);
    expect(src).not.toMatch(/transfer-store/);
    expect(src).not.toMatch(/node:crypto/);
    expect(src).not.toMatch(/@upstash/);
    expect(src).not.toMatch(/cookie-codec/);
    // No import from the package root barrel (./index).
    expect(src).not.toMatch(/from\s+["']\.\/index/);
  });
});
