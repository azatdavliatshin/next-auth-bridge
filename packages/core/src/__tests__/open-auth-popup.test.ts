// next-auth-bridge — suite for openAuthPopup, the opener-side popup-bridge helper.
//
// openAuthPopup is the receiver half of the Mode A handoff and the
// security-critical consumer of the trust predicate. The { code } it resolves is a
// bearer handle, so a message failing EITHER the origin allowlist OR the
// event.source === popupWin identity check (THREAT-03, delegated to
// isTrustedMessage) MUST be ignored and never resolve the flow.
//
// The promise contract under test:
//   - resolves { code } only on a trusted + namespaced + auth-success message
//   - ignores wrong-origin, wrong-source, and foreign-namespace messages
//   - rejects a typed, distinguishable OpenAuthPopupError on auth-error,
//     popup-closed (close-poll), and timeout
//   - tears down the listener AND both timers on EVERY settle path (no leaks)
//
// All browser deps are injected (D-12): the flow runs with NO global window and
// NO real timers, driven by the shared DI fakes (makeFakeOpen / makeFakePopup /
// makeFakeMessageBus / makeFakeClock). Casts to `unknown` are permitted test
// scaffolding per CLAUDE.md.

import { describe, it, expect } from "vitest";
import {
  openAuthPopup,
  OpenAuthPopupError,
  type OpenAuthPopupDeps,
} from "../open-auth-popup.js";
import {
  makeFakeOpen,
  makeFakePopup,
  makeFakeMessageBus,
  makeFakeClock,
} from "./helpers.js";

const ORIGIN = "https://app.test";
const TIMEOUT_MS = 1000;
const POLL_MS = 100;

/**
 * Wire openAuthPopup with the shared DI fakes and return both the in-flight
 * promise and the fakes, so a test can drive the channel/clock and assert on the
 * recorders (e.g. message-bus unsubscribed, clock has no pending timers).
 */
function setup(
  opts: {
    popup?: unknown | null;
    closeConfirmations?: number;
    // The close-poll is opt-in in the implementation. The helper enables it by
    // default (POLL_MS) so the close-poll tests below exercise it; pass `null` to
    // model the production default where no close-poll runs.
    closePollMs?: number | null;
  } = {},
): {
  promise: Promise<{ code: string }>;
  bus: ReturnType<typeof makeFakeMessageBus>;
  clock: ReturnType<typeof makeFakeClock>;
  popup: ReturnType<typeof makeFakePopup>;
  openRec: ReturnType<typeof makeFakeOpen>;
} {
  const popup = makeFakePopup();
  const popupArg = "popup" in opts ? opts.popup : popup;
  const openRec = makeFakeOpen(popupArg);
  const bus = makeFakeMessageBus();
  const clock = makeFakeClock();

  const deps: OpenAuthPopupDeps = {
    allowedOrigins: [ORIGIN],
    open: openRec.open as OpenAuthPopupDeps["open"],
    addMessageListener:
      bus.addMessageListener as OpenAuthPopupDeps["addMessageListener"],
    setTimer: clock.setTimeout,
    timeoutMs: TIMEOUT_MS,
    // null → omit closePollMs entirely (production default: no poll).
    ...(opts.closePollMs === null ? {} : { closePollMs: opts.closePollMs ?? POLL_MS }),
    // Default to a single confirmation so the existing single-observation tests
    // stay direct; the consecutive-confirmation behavior has its own tests below.
    closeConfirmations: opts.closeConfirmations ?? 1,
  };

  const promise = openAuthPopup(deps);
  return { promise, bus, clock, popup, openRec };
}

describe("openAuthPopup", () => {
  it("resolves { code } on a trusted, namespaced auth-success message", async () => {
    const { promise, bus, popup, clock } = setup();
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "the-code" },
    });
    await expect(promise).resolves.toEqual({ code: "the-code" });
    // cleanup on resolve: listener unsubscribed AND no timers pending.
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("closes the popup on a successful handoff", async () => {
    const { promise, bus, popup } = setup();
    expect(popup.closeCalls).toBe(0);
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "x" },
    });
    await expect(promise).resolves.toEqual({ code: "x" });
    // The stray popup window is dismissed once the handle is in hand.
    expect(popup.closeCalls).toBe(1);
  });

  it("does NOT close the popup on an untrusted (wrong-origin) message", async () => {
    const { promise, bus, popup } = setup();
    bus.dispatch({
      origin: "https://evil.test",
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "nope" },
    });
    // Race against a tick: the impostor must not settle or close anything.
    const sentinel = Symbol("pending");
    expect(
      await Promise.race([
        promise.then(() => "resolved"),
        Promise.resolve(sentinel),
      ]),
    ).toBe(sentinel);
    expect(popup.closeCalls).toBe(0);
  });

  it("resolves once and closes the popup once — a second trusted message is a no-op", async () => {
    const { promise, bus, popup } = setup();
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "first" },
    });
    // A second trusted message for the same handoff must not re-settle or
    // re-close.
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "second" },
    });
    await expect(promise).resolves.toEqual({ code: "first" });
    expect(popup.closeCalls).toBe(1); // closed exactly once
  });

  it("THREAT-03: ignores a wrong-origin message; a subsequent valid one still resolves", async () => {
    const { promise, bus, popup } = setup();
    // disallowed origin but otherwise valid → isTrustedMessage false → ignored.
    bus.dispatch({
      origin: "https://evil.test",
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "nope" },
    });
    // a later valid message still resolves (the flow was not settled by the impostor).
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "good" },
    });
    await expect(promise).resolves.toEqual({ code: "good" });
  });

  it("THREAT-03: ignores a wrong-source message (same-origin racer)", async () => {
    const { promise, bus } = setup();
    const racer = { id: "not-the-popup" } as unknown;
    bus.dispatch({
      origin: ORIGIN,
      source: racer, // !== the opened popup window
      data: { source: "next-auth-bridge", type: "auth-success", code: "forged" },
    });
    // Assert the promise does not resolve from the impostor: race it against a tick.
    const sentinel = Symbol("pending");
    const winner = await Promise.race([
      promise.then(() => "resolved"),
      Promise.resolve(sentinel),
    ]);
    expect(winner).toBe(sentinel);
  });

  it("ignores a foreign-namespace message (origin+source ok, wrong data.source)", async () => {
    const { promise, bus, popup } = setup();
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "some-other-lib", type: "auth-success", code: "forged" },
    });
    const sentinel = Symbol("pending");
    const winner = await Promise.race([
      promise.then(() => "resolved"),
      Promise.resolve(sentinel),
    ]);
    expect(winner).toBe(sentinel);
  });

  it("rejects with reason 'auth-error' on a trusted auth-error message", async () => {
    const { promise, bus, popup, clock } = setup();
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-error", error: "boom" },
    });
    await expect(promise).rejects.toMatchObject({ reason: "auth-error" });
    await promise.catch((e) => expect(e).toBeInstanceOf(OpenAuthPopupError));
    // cleanup on auth-error settle.
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("rejects with reason 'popup-closed' when the OPT-IN close-poll sees the popup closed", async () => {
    const { promise, bus, popup, clock } = setup();
    // user dismisses the popup; the next poll tick observes closed === true.
    popup.close();
    clock.advance(POLL_MS);
    await expect(promise).rejects.toMatchObject({ reason: "popup-closed" });
    // cleanup on popup-closed settle.
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("the default (no closePollMs) NEVER rejects popup-closed — a COOP-severed popup mid-sign-in still resolves (the fix)", async () => {
    // Production default: no close-poll. Models the real Mode A flow where the
    // popup navigates to a COOP-protected identity provider that severs the opener
    // so popupWin.closed reads true while the popup is alive and the user is still
    // authenticating. The flow must NOT give up; a later trusted auth-success
    // (posted when the popup returns to our origin) still resolves.
    const { promise, bus, popup, clock } = setup({ closePollMs: null });

    // The popup appears "closed" the whole time it is on the IdP.
    popup.close();
    // Advance past several would-be poll intervals (but short of the timeout):
    // with no poll there is no popup-closed rejection, so the flow stays pending.
    clock.advance(POLL_MS * 5); // 500ms < TIMEOUT_MS (1000ms)

    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "after-idp" },
    });
    await expect(promise).resolves.toEqual({ code: "after-idp" });
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("the default (no closePollMs) still rejects on timeout if nothing settles", async () => {
    // No close-poll, but the timeout remains the backstop so the promise can never
    // hang forever.
    const { promise, bus, popup, clock } = setup({ closePollMs: null });
    popup.close(); // never causes a rejection on its own…
    clock.advance(TIMEOUT_MS); // …only the timeout settles the flow.
    await expect(promise).rejects.toMatchObject({ reason: "timeout" });
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("requires consecutive 'closed' observations before rejecting popup-closed", async () => {
    // closeConfirmations = 3: the popup must read closed on three consecutive
    // polls before the flow gives up.
    const { promise, popup, clock, bus } = setup({ closeConfirmations: 3 });
    const settledEarly = Symbol("pending");

    popup.close(); // closed === true from here on
    clock.advance(POLL_MS); // observation 1
    clock.advance(POLL_MS); // observation 2
    // After only two observations the flow must still be pending.
    expect(
      await Promise.race([
        promise.then(() => "settled"),
        Promise.resolve(settledEarly),
      ]),
    ).toBe(settledEarly);

    clock.advance(POLL_MS); // observation 3 → reject
    await expect(promise).rejects.toMatchObject({ reason: "popup-closed" });
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("does NOT reject when a transient cross-origin 'closed' blip clears (the bug fix)", async () => {
    // Models the popup navigating cross-origin (e.g. to an identity provider):
    // `closed` reads true on one poll, then false again as the navigation
    // settles. With closeConfirmations = 3 the counter resets and the flow
    // proceeds — a later auth-success still resolves.
    const { promise, popup, clock, bus } = setup({ closeConfirmations: 3 });
    const mutable = popup as unknown as { closed: boolean };

    mutable.closed = true;
    clock.advance(POLL_MS); // observation 1 (transient blip)
    mutable.closed = false; // navigation settled — popup alive again
    clock.advance(POLL_MS); // counter resets
    mutable.closed = true;
    clock.advance(POLL_MS); // observation 1 again (not 2 — was reset)

    // The popup posts its handle after the round-trip; the flow must still resolve.
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "post-nav" },
    });
    await expect(promise).resolves.toEqual({ code: "post-nav" });
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("rejects with reason 'timeout' when no message arrives in time", async () => {
    const { promise, bus, clock } = setup();
    clock.advance(TIMEOUT_MS);
    await expect(promise).rejects.toMatchObject({ reason: "timeout" });
    // cleanup on timeout settle.
    expect(bus.unsubscribed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("rejects with reason 'popup-blocked' when open() returns null", async () => {
    const { promise, bus, clock } = setup({ popup: null });
    await expect(promise).rejects.toMatchObject({ reason: "popup-blocked" });
    // nothing was ever registered, so nothing leaks.
    expect(clock.pending()).toBe(0);
    expect(bus.unsubscribed).toBe(false); // no listener was ever registered
  });

  it("does not re-settle: a poll tick after resolve does not flip the result or leak", async () => {
    const { promise, bus, popup, clock } = setup();
    bus.dispatch({
      origin: ORIGIN,
      source: popup,
      data: { source: "next-auth-bridge", type: "auth-success", code: "done" },
    });
    await expect(promise).resolves.toEqual({ code: "done" });
    // Advancing the clock past the (already-cleared) timers must be a no-op.
    popup.close();
    clock.advance(TIMEOUT_MS + POLL_MS);
    expect(clock.pending()).toBe(0);
  });
});
