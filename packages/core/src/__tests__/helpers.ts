// next-auth-bridge — shared test fixtures for the Wave 2/3 route + client tests.
//
// VALIDATION Wave 0: the bridge/consume route tests need three reusable
// builders — a plain Web-standard Request factory (D-06: handlers are
// Request => Response, driven on the Vitest bench with no Next.js runtime), a
// fake session verifier (D-04), and an in-memory store wiring helper. All are
// builder/factory functions in the Phase 1 fake-fixture style (no classes).
//
// Phase 3 adds the client-side DI fakes (Wave 2/3): a fake window-like, a fake
// popup Window, a fake `open` recorder, a fake message bus with unsubscribe, a
// fake recording opener (`postMessage`), and a deterministic clock/timer seam.
// All browser deps in the client helpers are injected via parameters (D-12), so
// these fakes let the popup flow be driven with NO global window and NO real
// timers — the same zero-DOM / injected-clock discipline as the store contract.
//
// The store is ALWAYS the dependency-free in-memory adapter — never KV on the
// bench (RESEARCH test mandate; KV is exercised only by the Phase 5 Vercel
// preview).
//
// Test scaffolding may relax to `unknown`/casts per CLAUDE.md — these are
// fixtures, not shipped surface.

import type { VerifySession } from "../types.js";
import type { TransferStore } from "../transfer-store/types.js";
import { createInMemoryTransferStore } from "../transfer-store/in-memory.js";

/**
 * Build a plain Web-standard `Request` for a route handler under test (D-06).
 *
 * @param url The request URL (absolute, e.g. "https://app.test/auth/bridge").
 * @param init Optional method (default "GET") and a flat header map (e.g. a
 *   `Cookie` or `Origin` header the handler reads).
 */
export function makeRequest(
  url: string,
  init?: { headers?: Record<string, string>; method?: string },
): Request {
  return new Request(url, {
    method: init?.method ?? "GET",
    headers: init?.headers ?? {},
  });
}

/**
 * Build a fake `verifySession` (D-04) that always resolves the supplied session
 * (or `null` for the no-session refusal path). Zero-arg, matching the real
 * verifier contract — the app closes over its own request access via `auth()`,
 * so the bridge harvests chunks from the request it already holds (D-05).
 *
 * @param session The session value to resolve — any truthy value exercises the
 *   happy path; `null` exercises the 401 refusal.
 */
export function fakeVerifySession(session: unknown | null): VerifySession {
  return async () => session;
}

/**
 * Build the dependency-free in-memory {@link TransferStore} the route tests
 * inject as `options.store` — no KV, no network on the bench (RESEARCH mandate).
 * Pass-through options (e.g. an injected `now` clock) reach the underlying
 * adapter for the TTL cases.
 */
export function makeTestStore(
  ...args: Parameters<typeof createInMemoryTransferStore>
): TransferStore {
  return createInMemoryTransferStore(...args);
}

// ---------------------------------------------------------------------------
// Phase 3 client-side DI fakes (consumed by the Wave 2/3 plans:
// detectContext / isTrustedMessage / openAuthPopup / runPopupFlow).
//
// These deliberately model only the structural surface the client helpers read,
// not the full DOM — the package carries no DOM lib (tsconfig `lib: ["ES2022"]`).
// Casts to `unknown` are permitted test scaffolding (CLAUDE.md).
// ---------------------------------------------------------------------------

/**
 * (a) A fake `window`-like with controllable `self` / `top` identity for the
 * detect-context family. By default `self === top` (a top-level browser tab);
 * pass `{ embedded: true }` to make `self !== top` (an iframe), or
 * `{ throwOnTop: true }` to make reading `top` throw a SecurityError (the
 * cross-origin-embedded signal).
 *
 * @returns a plain object exposing `self` and `top` (the structural shape a
 *   `detectContext`-style consumer reads).
 */
export function makeFakeWindow(
  opts: { embedded?: boolean; throwOnTop?: boolean } = {},
): { self: unknown; top: unknown } {
  const selfRef = {};
  const topRef = opts.embedded ? {} : selfRef;
  if (opts.throwOnTop) {
    return {
      self: selfRef,
      get top(): unknown {
        throw new Error("SecurityError: Blocked a frame with origin");
      },
    };
  }
  return { self: selfRef, top: topRef };
}

/**
 * (b) A fake popup `Window` object. It is intentionally a bare unique reference:
 * it is used BOTH as an `open()` return value AND as the `expectedSource`
 * identity for `isTrustedMessage` (which compares by `===`), so its only
 * meaningful property is its object identity. The optional recording fields let
 * `runPopupFlow`-style tests assert the popup was closed / focused.
 *
 * @returns a unique object with no-op `close` / `focus` recorders.
 */
export function makeFakePopup(): {
  closed: boolean;
  closeCalls: number;
  focusCalls: number;
  close: () => void;
  focus: () => void;
} {
  const popup = {
    closed: false,
    closeCalls: 0,
    focusCalls: 0,
    close(): void {
      popup.closed = true;
      popup.closeCalls += 1;
    },
    focus(): void {
      popup.focusCalls += 1;
    },
  };
  return popup;
}

/**
 * (c) A fake `open(url, target, features?)` recorder. It captures every call's
 * args and returns the supplied popup (the default is a fresh {@link
 * makeFakePopup}), or `null` to simulate a popup blocked by the browser.
 *
 * @param popup the Window to return from `open` (default a fresh fake popup);
 *   pass `null` to exercise the blocked-popup path.
 * @returns `{ open, calls }` — `open` is the injectable fn, `calls` is the
 *   recorded argument list.
 */
export function makeFakeOpen(popup?: unknown | null): {
  open: (url: string, target?: string, features?: string) => unknown | null;
  calls: Array<{ url: string; target?: string; features?: string }>;
} {
  const resolvedPopup = popup === undefined ? makeFakePopup() : popup;
  const calls: Array<{ url: string; target?: string; features?: string }> = [];
  return {
    open(url: string, target?: string, features?: string): unknown | null {
      calls.push({ url, target, features });
      return resolvedPopup;
    },
    calls,
  };
}

/**
 * (d) A fake message bus modeling the `addMessageListener(cb) => unsubscribe`
 * seam. A test registers a callback, drives the channel by calling `dispatch`
 * with a fake `MessageEventLike` ({ origin, source, data }), and asserts
 * `unsubscribed` flips true after the consumer cleans up its listener.
 *
 * @returns `addMessageListener` (the injectable seam), `dispatch` (test-only
 *   driver fanning an event to all registered callbacks), and `unsubscribed`
 *   (true once every registered listener has been removed).
 */
export function makeFakeMessageBus(): {
  addMessageListener: (cb: (event: unknown) => void) => () => void;
  dispatch: (event: { origin: string; source: unknown; data: unknown }) => void;
  get unsubscribed(): boolean;
} {
  const listeners = new Set<(event: unknown) => void>();
  let everRegistered = 0;
  return {
    addMessageListener(cb: (event: unknown) => void): () => void {
      listeners.add(cb);
      everRegistered += 1;
      return () => {
        listeners.delete(cb);
      };
    },
    dispatch(event: {
      origin: string;
      source: unknown;
      data: unknown;
    }): void {
      for (const cb of listeners) cb(event);
    },
    get unsubscribed(): boolean {
      return everRegistered > 0 && listeners.size === 0;
    },
  };
}

/**
 * (e) A fake opener with a recording `postMessage(data, targetOrigin)`, for the
 * `runPopupFlow` side that posts the bearer handle back to its opener. Captures
 * every `data` and `targetOrigin` so a test can assert the handle was posted to
 * the expected target origin (never `"*"`).
 *
 * @returns `{ postMessage, calls }` — `postMessage` is the injectable fn,
 *   `calls` is the recorded `{ data, targetOrigin }` list.
 */
export function makeFakeOpener(): {
  postMessage: (data: unknown, targetOrigin: string) => void;
  calls: Array<{ data: unknown; targetOrigin: string }>;
} {
  const calls: Array<{ data: unknown; targetOrigin: string }> = [];
  return {
    postMessage(data: unknown, targetOrigin: string): void {
      calls.push({ data, targetOrigin });
    },
    calls,
  };
}

/**
 * (f) A deterministic clock/timer seam (modeled on the store contract's injected
 * `now`), so a close-poll / timeout in `openAuthPopup` can be driven with NO
 * real waits. `now()` returns the current virtual time; `advance(ms)` moves it
 * forward and fires any timers whose delay has elapsed. `setTimeout` registers a
 * timer and returns a `clear` handle.
 *
 * @param start the initial virtual time in ms (default 0).
 * @returns `{ now, setTimeout, advance, pending }` — a fully deterministic
 *   timer surface with no global timer mocking.
 */
export function makeFakeClock(start = 0): {
  now: () => number;
  setTimeout: (cb: () => void, delayMs: number) => () => void;
  advance: (ms: number) => void;
  pending: () => number;
} {
  let current = start;
  let nextId = 0;
  const timers = new Map<number, { fireAt: number; cb: () => void }>();
  return {
    now(): number {
      return current;
    },
    setTimeout(cb: () => void, delayMs: number): () => void {
      const id = nextId++;
      timers.set(id, { fireAt: current + delayMs, cb });
      return () => {
        timers.delete(id);
      };
    },
    advance(ms: number): void {
      current += ms;
      // Fire (and remove) every timer whose deadline is now reached, in order.
      const due = [...timers.entries()]
        .filter(([, t]) => t.fireAt <= current)
        .sort((a, b) => a[1].fireAt - b[1].fireAt);
      for (const [id, t] of due) {
        timers.delete(id);
        t.cb();
      }
    },
    pending(): number {
      return timers.size;
    },
  };
}
