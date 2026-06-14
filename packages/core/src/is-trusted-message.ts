// next-auth-bridge — the trust predicate for the popup -> opener postMessage
// channel.
//
// The popup delivers a one-time bearer handle ({ code }) to its opener across an
// untrusted cross-window channel. Any window can postMessage to the opener, so
// the opener MUST decide whether to trust a given message BEFORE reading its
// payload. This predicate is that decision, kept pure (no DOM, no globals) so it
// can be exercised in isolation.
//
// It is a bare exported function (no class, no factory), separately importable
// in the style of the auth-helpers — a self-contained security boundary.

/**
 * The structural shape of a message-channel event this predicate inspects. A
 * local type (NOT the DOM `MessageEvent`) so the predicate carries zero DOM
 * dependency and runs in a pure-Node environment.
 */
export interface MessageEventLike {
  /** The origin of the document that sent the message. */
  origin: string;
  /** The sending window reference (compared by identity). */
  source: unknown;
  /** The message payload (opaque to the predicate). */
  data: unknown;
}

/**
 * Decide whether a received channel message may be trusted. BOTH checks must
 * pass — either one alone is insufficient:
 *
 * 1. Origin allowlist: `event.origin` must be one of `allowedOrigins`. This gates
 *    *which document* may speak to us. An origin not on the list is rejected
 *    outright (an empty allowlist therefore trusts nothing).
 * 2. Source identity: `event.source` must be the exact Window object we are
 *    expecting (strict `===`). Origin alone is not enough — a different,
 *    *same-origin* window (e.g. another tab or an injected sibling frame on our
 *    own origin) shares our origin yet is not the popup we opened; it could race
 *    the channel and forge the handle. Pinning the sender's identity rejects that
 *    impostor even though its origin would pass the allowlist.
 *
 * Only when origin is allowed AND the source is the expected window does the
 * caller proceed to read the bearer handle.
 *
 * @param event The received message (structural — no DOM dependency).
 * @param opts.allowedOrigins The trusted origin allowlist (matches
 *   `AuthBridgeOptions.allowedOrigins` exactly — one source of truth).
 * @param opts.expectedSource The exact window reference the caller is expecting
 *   as the sender (compared by `===`).
 * @returns `true` only when both the origin and the source identity match.
 */
export function isTrustedMessage(
  event: MessageEventLike,
  opts: { allowedOrigins: readonly string[]; expectedSource: unknown },
): boolean {
  if (!opts.allowedOrigins.includes(event.origin)) return false;
  if (event.source !== opts.expectedSource) return false;
  return true;
}
