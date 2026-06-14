// next-auth-bridge — the opener-side helper for the popup-bridge (Mode A) flow.
//
// An embedded app (running inside an enterprise iframe) calls openAuthPopup to
// open the top-level /auth/popup window, then awaits the popup's postMessage. The
// popup silent-auths against the host's identity-provider session and posts back a
// one-time bearer handle ({ code }). Because any window can postMessage to the
// opener, the inbound message is untrusted: the opener MUST validate the sender
// before reading the handle.
//
// This module is the receiver half of the handoff. It delegates the
// origin-allowlist + source-identity trust check to isTrustedMessage (the shared
// security predicate), applies a namespace + type discriminator, and exposes the
// result as a single awaitable promise: it resolves { code } on a trusted
// auth-success message, and rejects with a typed, distinguishable reason on an
// auth-error message or a timeout. On every settle path it tears down the message
// listener, the (optional) close-poll, and the timeout so nothing leaks.
//
// Why the close-poll is OPT-IN and OFF by default: in the real Mode A scenario
// the popup is opened from inside a cross-site iframe and then navigates to the
// identity provider for an interactive sign-in. The IdP serves a
// Cross-Origin-Opener-Policy, which moves the popup into a separate
// browsing-context group and SEVERS the opener relationship — at which point the
// opener's `popupWin.closed` reads `true` even though the popup is alive and the
// user is still authenticating. A close-poll would mistake that for a dismissal
// and reject prematurely. So the default flow relies SOLELY on the trusted
// postMessage (+ a timeout), exactly like a known-good production SharePoint+Entra
// integration. A consumer driving a same-origin, non-COOP popup who genuinely
// wants "user dismissed" detection can opt in by passing `closePollMs`.
//
// Every browser dependency (open, message-listener registration, clock/timer) is
// injected, so the flow runs with no global window and no real timers in tests.
// The module carries zero DOM lib dependency (tsconfig `lib: ["ES2022]`): all
// window-like values are local structural types, defaulting to `globalThis`.

import { isTrustedMessage, type MessageEventLike } from "./is-trusted-message.js";

/**
 * The distinct ways the popup flow can fail. Callers switch on this to tell the
 * failure modes apart without string-matching messages:
 *
 * - `auth-error`: the popup posted a trusted auth-error message (the auth attempt
 *   failed inside the popup).
 * - `popup-blocked`: the injected `open()` returned a falsy value — the browser
 *   blocked the popup, so there is no window to await.
 * - `popup-closed`: the OPT-IN close-poll observed the popup `closed` before any
 *   message arrived (the user dismissed it). Only possible when the caller passes
 *   `closePollMs`; the default flow does not poll `closed` (see module header).
 * - `timeout`: no settling message arrived within `timeoutMs`.
 */
export type OpenAuthPopupFailureReason =
  | "auth-error"
  | "popup-blocked"
  | "popup-closed"
  | "timeout";

/**
 * A typed, distinguishable rejection from {@link openAuthPopup}. The `reason`
 * discriminant lets a caller branch on the failure mode (e.g. retry on
 * `popup-closed`, surface a "popups are blocked" hint on `popup-blocked`).
 */
export class OpenAuthPopupError extends Error {
  readonly reason: OpenAuthPopupFailureReason;
  constructor(reason: OpenAuthPopupFailureReason, message?: string) {
    super(message ?? reason);
    this.name = "OpenAuthPopupError";
    this.reason = reason;
  }
}

/**
 * A minimal structural view of the popup window the flow needs — its `closed`
 * flag (read by the OPT-IN close-poll) and a `close()` to dismiss the popup once
 * the handle has been received. NOT the DOM `Window` type, so the module needs no
 * DOM lib; the real popup window is assignable to it.
 *
 * `close()` is optional because a COOP-severed popup cannot always be closed by
 * its (now-disconnected) opener — the call is best-effort and guarded.
 */
export interface PopupWindowLike {
  readonly closed: boolean;
  close?: () => void;
}

/** The namespace every legitimate bridge message carries (foreign messages that
 * pass origin+source but lack this are ignored). */
const MESSAGE_NAMESPACE = "next-auth-bridge";

/** Default popup entry path (no token ever appears in the URL — only the opaque
 * handle is exchanged, and that travels back via postMessage, not the URL). */
const DEFAULT_POPUP_URL = "/auth/popup";

/** Default window.open feature string for a small centred-ish auth popup. */
const DEFAULT_POPUP_FEATURES = "popup=yes,width=480,height=640";

/** Default wait before rejecting with `timeout` (ms). */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Default number of CONSECUTIVE `closed === true` poll observations required
 * before the flow rejects with `popup-closed`, WHEN the close-poll is opted into
 * via `closePollMs`.
 *
 * Why more than one even when opted in: while a popup is navigated cross-origin
 * (e.g. briefly to an identity provider and back), the opener's handle to it is a
 * cross-origin Window proxy whose `closed` getter can transiently read `true`
 * mid-navigation even though the window is alive. A single reading must NOT be
 * mistaken for a dismissal. Requiring several consecutive `closed` observations
 * lets a transient blip clear (the counter resets the moment `closed` reads
 * `false` again) while a genuine close still settles after a few polls.
 *
 * NOTE: this only mitigates a TRANSIENT severance. A persistent COOP severance
 * (the IdP keeps the popup in a separate browsing-context group for the whole
 * interactive sign-in) keeps `closed === true` indefinitely, so no confirmation
 * count is safe there — which is exactly why the close-poll is off by default.
 */
const DEFAULT_CLOSE_CONFIRMATIONS = 3;

/**
 * Injected dependencies for {@link openAuthPopup}. Every browser global is a
 * parameter (D-12 style): the flow can be driven in a pure-Node test with no
 * window and no real timers. Real-browser defaults are provided where a global is
 * the obvious source.
 */
export interface OpenAuthPopupDeps {
  /**
   * Open the popup and return the popup window-like (or a falsy value if the
   * browser blocked it). Defaults to `globalThis.open`.
   */
  open?: (
    url: string,
    target?: string,
    features?: string,
  ) => PopupWindowLike | null | undefined;
  /**
   * Register a message-channel listener and return its unsubscribe fn. Defaults to
   * wiring `globalThis.addEventListener("message", …)`.
   */
  addMessageListener?: (cb: (event: MessageEventLike) => void) => () => void;
  /** The trusted origin allowlist — matches `AuthBridgeOptions.allowedOrigins`. */
  allowedOrigins: readonly string[];
  /** Popup entry URL (default `/auth/popup`). */
  popupUrl?: string;
  /** `window.open` target name (default `next-auth-bridge-popup`). */
  popupTarget?: string;
  /** `window.open` feature string. */
  popupFeatures?: string;
  /** Virtual-clock-friendly timer seam. Defaults to the global timers. */
  setTimer?: (cb: () => void, delayMs: number) => () => void;
  /** Reject-after delay in ms (default 120_000). */
  timeoutMs?: number;
  /**
   * Close-poll interval in ms. OPT-IN: when omitted (the default) NO close-poll
   * runs and the flow never rejects with `popup-closed` — it relies solely on the
   * trusted postMessage plus the timeout. This is the correct default for the Mode
   * A flow, where the popup navigates to a COOP-protected identity provider that
   * severs the opener and makes `popupWin.closed` read `true` while the popup is
   * still alive. Pass a value ONLY for a same-origin, non-COOP popup where you want
   * "user dismissed the popup" detection.
   */
  closePollMs?: number;
  /**
   * Consecutive `closed === true` poll observations required before rejecting
   * with `popup-closed` (default 3). Only consulted when `closePollMs` is set.
   * Guards against a popup whose `closed` getter transiently reads `true` during a
   * brief cross-origin navigation; a value of 1 rejects on the first observation.
   */
  closeConfirmations?: number;
}

/**
 * A trusted bridge message shape after origin+source+namespace pass. A
 * discriminated union on `type`.
 */
type BridgeMessage =
  | { source: typeof MESSAGE_NAMESPACE; type: "auth-success"; code: string }
  | { source: typeof MESSAGE_NAMESPACE; type: "auth-error"; error?: unknown };

/** Narrow an unknown payload to a namespaced bridge message. */
function asBridgeMessage(data: unknown): BridgeMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.source !== MESSAGE_NAMESPACE) return null;
  if (d.type === "auth-success" && typeof d.code === "string") {
    return { source: MESSAGE_NAMESPACE, type: "auth-success", code: d.code };
  }
  if (d.type === "auth-error") {
    return { source: MESSAGE_NAMESPACE, type: "auth-error", error: d.error };
  }
  return null;
}

/** Resolve the default global `open`, if present. */
function defaultOpen(
  url: string,
  target?: string,
  features?: string,
): PopupWindowLike | null | undefined {
  const g = globalThis as {
    open?: (u: string, t?: string, f?: string) => PopupWindowLike | null;
  };
  return g.open ? g.open(url, target, features) : null;
}

/** Wire the default global message listener, if `addEventListener` exists. */
function defaultAddMessageListener(
  cb: (event: MessageEventLike) => void,
): () => void {
  const g = globalThis as {
    addEventListener?: (t: string, l: (e: unknown) => void) => void;
    removeEventListener?: (t: string, l: (e: unknown) => void) => void;
  };
  const handler = (e: unknown): void => cb(e as MessageEventLike);
  g.addEventListener?.("message", handler);
  return () => {
    g.removeEventListener?.("message", handler);
  };
}

/** Default repeating-timer built on the one-shot `setTimer` seam. */
function makeIntervalFromTimer(
  setTimer: (cb: () => void, delayMs: number) => () => void,
  cb: () => void,
  delayMs: number,
): () => void {
  let cleared = false;
  let cancel: () => void = () => {};
  const tick = (): void => {
    if (cleared) return;
    cb();
    if (cleared) return;
    cancel = setTimer(tick, delayMs);
  };
  cancel = setTimer(tick, delayMs);
  return () => {
    cleared = true;
    cancel();
  };
}

/**
 * Open the auth popup and await its one-time bearer handle.
 *
 * Opens `popupUrl` via the injected `open()`, registers a message listener, and
 * returns a promise that:
 *
 * - RESOLVES `{ code }` on the first message that is trusted (origin allow-listed
 *   AND `event.source` === the opened popup window — delegated to
 *   {@link isTrustedMessage}), namespaced (`data.source === "next-auth-bridge"`),
 *   and of type `auth-success` with a string `code`. A message failing ANY of
 *   these checks is ignored and never resolves the flow.
 * - REJECTS with an {@link OpenAuthPopupError} whose `reason` distinguishes:
 *   `popup-blocked` (open returned falsy), `auth-error` (trusted auth-error
 *   message), `popup-closed` (only when the OPT-IN close-poll is enabled via
 *   `closePollMs` and observes the popup closed on `closeConfirmations`
 *   consecutive ticks), or `timeout`. By default no close-poll runs, so the flow
 *   tolerates a COOP-severed popup mid-sign-in (see module header).
 *
 * On a successful (or auth-error) settle it best-effort closes the popup
 * (`popupWin.close()`, guarded) so the user is not left with a stray window —
 * harmless when the popup already self-closed.
 *
 * On every settle path the message listener, the (optional) close-poll, and the
 * timeout are torn down exactly once — no listener or timer leaks.
 *
 * @param deps Injected browser deps + tuning (see {@link OpenAuthPopupDeps}).
 * @returns A promise resolving `{ code }` or rejecting an {@link OpenAuthPopupError}.
 */
export function openAuthPopup(
  deps: OpenAuthPopupDeps,
): Promise<{ code: string }> {
  const open = deps.open ?? defaultOpen;
  const addMessageListener = deps.addMessageListener ?? defaultAddMessageListener;
  const setTimer = deps.setTimer ?? ((cb, ms) => {
    const id = setTimeout(cb, ms);
    return () => clearTimeout(id);
  });
  const popupUrl = deps.popupUrl ?? DEFAULT_POPUP_URL;
  const popupTarget = deps.popupTarget ?? "next-auth-bridge-popup";
  const popupFeatures = deps.popupFeatures ?? DEFAULT_POPUP_FEATURES;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // OPT-IN: the close-poll runs only when the caller passes a positive
  // `closePollMs`. Omitted (the default) means no poll and no `popup-closed`
  // rejection — the flow settles purely on the trusted message or the timeout.
  const closePollMs =
    typeof deps.closePollMs === "number" && deps.closePollMs > 0
      ? deps.closePollMs
      : undefined;
  // At least one observation is always required; a configured value below 1 is
  // clamped so the poll can never reject without ever reading `closed`.
  const closeConfirmations = Math.max(
    1,
    deps.closeConfirmations ?? DEFAULT_CLOSE_CONFIRMATIONS,
  );

  return new Promise<{ code: string }>((resolve, reject) => {
    const popupWin = open(popupUrl, popupTarget, popupFeatures);

    // Blocked popup: no window to await — reject immediately (nothing to clean up
    // yet, no listener/poll/timeout was started).
    if (!popupWin) {
      reject(
        new OpenAuthPopupError(
          "popup-blocked",
          "The auth popup was blocked or could not be opened.",
        ),
      );
      return;
    }

    // Teardown handles, populated as each resource is acquired. cleanup() runs the
    // teardown exactly once (idempotent) on the first settle.
    let settled = false;
    let unsubscribe: () => void = () => {};
    let clearClosePoll: () => void = () => {};
    let clearTimeoutTimer: () => void = () => {};

    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearClosePoll();
      clearTimeoutTimer();
    };

    // Best-effort dismissal of the popup once the handle is in hand. Guarded: a
    // COOP-severed popup may not be closable by its (disconnected) opener, and the
    // call can throw — never let that mask a successful settle.
    const closePopup = (): void => {
      try {
        popupWin.close?.();
      } catch {
        // ignore — closing is best-effort cosmetics, not part of the contract.
      }
    };

    // Settle the flow from an ALREADY-VALIDATED bridge message (namespace + type
    // checked by asBridgeMessage), exactly once.
    const settleFromMessage = (msg: BridgeMessage): void => {
      if (settled) return;
      if (msg.type === "auth-success") {
        cleanup();
        closePopup();
        resolve({ code: msg.code });
        return;
      }
      // auth-error
      cleanup();
      closePopup();
      reject(
        new OpenAuthPopupError(
          "auth-error",
          "The popup reported an authentication error.",
        ),
      );
    };

    // Message channel: validate (origin+source via isTrustedMessage) → namespace +
    // type discriminator → settle.
    unsubscribe = addMessageListener((event: MessageEventLike) => {
      if (settled) return;
      if (
        !isTrustedMessage(event, {
          allowedOrigins: deps.allowedOrigins,
          expectedSource: popupWin,
        })
      ) {
        return; // wrong-origin OR wrong-source — ignored, never resolves.
      }
      const msg = asBridgeMessage(event.data);
      if (!msg) return; // foreign / malformed namespace — ignored.
      settleFromMessage(msg);
    });

    // Close-poll (OPT-IN — runs only when `closePollMs` was provided): if the user
    // dismisses the popup before it posts, reject — but only after
    // `closeConfirmations` CONSECUTIVE `closed` readings, so a transient
    // `closed === true` blip during a brief cross-origin navigation is not mistaken
    // for a dismissal. The counter resets the instant a poll reads
    // `closed === false` again. When `closePollMs` is omitted (the default), this
    // block is skipped entirely and the flow never rejects with `popup-closed` —
    // required for the COOP-severed Mode A popup (see module header).
    if (closePollMs !== undefined) {
      let consecutiveClosed = 0;
      clearClosePoll = makeIntervalFromTimer(
        setTimer,
        () => {
          if (settled) return;
          if (!popupWin.closed) {
            consecutiveClosed = 0;
            return;
          }
          consecutiveClosed += 1;
          if (consecutiveClosed < closeConfirmations) return;
          cleanup();
          reject(
            new OpenAuthPopupError(
              "popup-closed",
              "The auth popup was closed before completing.",
            ),
          );
        },
        closePollMs,
      );
    }

    // Timeout: reject if nothing settles in time.
    clearTimeoutTimer = setTimer(() => {
      if (settled) return;
      cleanup();
      reject(
        new OpenAuthPopupError(
          "timeout",
          "The auth popup did not complete in time.",
        ),
      );
    }, timeoutMs);
  });
}
