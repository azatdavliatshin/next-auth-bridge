// next-auth-bridge — test suite for the detectContext open-union client detector.
//
// detectContext gives the client its iframe-vs-browser UX signal. It is NOT a
// security boundary (the real auth gate is the server-side verifySession); an
// unknown context value routing to the default browser branch is the safe
// failure. Cases:
//
//   - self !== top                          → 'iframe'
//   - self === top                          → 'browser'
//   - accessing top THROWS (cross-origin)   → 'iframe' (the throw IS the signal)
//   - an unknown/future BridgeContext member routes to the DEFAULT branch via
//     if/else (forward-compat) — never a type error, never a thrown case.
//
// The detector takes an injected `win` (default `window`), so tests pass a fake
// window-like and never touch a real global.
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md.

import { describe, it, expect } from "vitest";
import {
  detectContext,
  routeForContext,
  type BridgeContext,
} from "../detect-context.js";

describe("detectContext", () => {
  // The detector takes a structural window-like (no DOM lib in this package); the
  // fakes are cast through the parameter type, never a DOM `Window`.
  type Win = Parameters<typeof detectContext>[0];

  it("returns 'iframe' when self !== top", () => {
    const top = {};
    const win = { self: {}, top } as unknown as Win;
    expect(detectContext(win)).toBe("iframe");
  });

  it("returns 'browser' when self === top", () => {
    const shared = {};
    const win = { self: shared, top: shared } as unknown as Win;
    expect(detectContext(win)).toBe("browser");
  });

  it("returns 'iframe' when accessing top THROWS (cross-origin SecurityError)", () => {
    const win = {
      self: {},
      get top(): unknown {
        throw new Error("SecurityError: Blocked a frame with origin");
      },
    } as unknown as Win;
    expect(detectContext(win)).toBe("iframe");
  });
});

describe("routeForContext (open-union forward-compat default-fallback)", () => {
  it("routes 'iframe' to the popup entry", () => {
    expect(routeForContext("iframe")).toBe("popup-entry");
  });

  it("routes 'browser' to the normal default", () => {
    expect(routeForContext("browser")).toBe("normal");
  });

  it("routes an unknown/future context member to the default branch (no throw, no type error)", () => {
    // A hypothetical future union member the current code has never seen.
    const future = "some-future-context" as unknown as BridgeContext;
    expect(routeForContext(future)).toBe("normal");
    // The shipped v0.1 'pwa-shell' member (never returned by detectContext yet)
    // also routes to the safe default.
    expect(routeForContext("pwa-shell")).toBe("normal");
  });
});
