// next-auth-bridge — the popup-side flow orchestrator.
//
// runPopupFlow is the popup half of the cross-context handoff. The popup runs in
// a top-level browser context where the host's identity-provider session is
// reachable; it silent-auth fetches the bridge endpoint for an opaque one-time
// handle and forwards that handle to its opener over postMessage. The opener
// (not the popup) then drives /auth/consume — this function never touches a
// cookie or a session token, only the opaque handle.
//
// All browser dependencies are injected via parameters (the package carries no
// DOM lib: tsconfig `lib: ["ES2022"]`), defaulting to the ambient globals where
// a real default exists, so the flow is fully drivable on the test bench with a
// fake fetch and a fake recording opener.
//
// Security properties:
//  - The handle is posted with an EXPLICIT host origin as the postMessage
//    targetOrigin, NEVER the wildcard "*": a window other than the intended
//    opener origin cannot receive the bearer handle.
//  - The posted message carries ONLY the namespaced shape { source, type, code }
//    — no session token and no extra fields leak across the window boundary.
//  - A failed, non-200, or code-less bridge response posts a structured
//    auth-error message instead of throwing uncaught, so the opener can react
//    rather than hang.

/** The shared message namespace both windows agree on. */
const MESSAGE_SOURCE = "next-auth-bridge" as const;

/** The default bridge endpoint the popup fetches for its one-time handle. */
const DEFAULT_BRIDGE_PATH = "/auth/bridge";

/**
 * A structural fetch return — the only fields runPopupFlow reads. A local type
 * (NOT the DOM `Response`) keeping this module free of a hard DOM-lib coupling;
 * the real `fetch` Response is assignable to it.
 */
interface ResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
}

/**
 * A structural opener — exposes only the recording `postMessage(data, target)`
 * surface the flow needs. A local type (NOT the DOM `Window`) so the module
 * needs no DOM lib; the real cross-window `opener` is assignable to it.
 */
interface OpenerLike {
  postMessage(data: unknown, targetOrigin: string): void;
}

/** The injected dependencies for {@link runPopupFlow}. */
export interface PopupFlowDeps {
  /**
   * The bridge fetcher. Defaults to the ambient global `fetch` (reached via
   * `globalThis`) so production callers can omit it; tests inject a fake.
   */
  fetch?: (input: string) => Promise<ResponseLike>;

  /**
   * The opener to post the handle to. Required — there is no safe default for
   * the cross-window target (defaulting would risk posting to the wrong window).
   */
  opener: OpenerLike;

  /**
   * The EXPLICIT target origin string for the postMessage. Required and passed
   * verbatim as the second postMessage argument — this is the receiver pin that
   * MUST never be the wildcard "*".
   */
  hostOrigin: string;

  /** The bridge endpoint to fetch. Optional; defaults to `/auth/bridge`. */
  bridgePath?: string;
}

/** The success message the opener receives when the handle was minted. */
interface AuthSuccessMessage {
  source: typeof MESSAGE_SOURCE;
  type: "auth-success";
  code: string;
}

/** The structured failure message — the opener can distinguish it by `type`. */
interface AuthErrorMessage {
  source: typeof MESSAGE_SOURCE;
  type: "auth-error";
  reason: string;
}

/**
 * Run the popup-side handoff: fetch the bridge for an opaque `{ code }` handle
 * and post it to the opener as a namespaced `auth-success` message with an
 * explicit (never `"*"`) target origin.
 *
 * On any failure — a non-ok response, a missing `code`, malformed JSON, or a
 * thrown fetch — it posts a structured `auth-error` message instead of throwing,
 * so the opener can react. It never drives the consume step (the opener does
 * that) and never places a token or the handle in a URL.
 *
 * @param deps Injected browser deps: the bridge `fetch`, the `opener` to post
 *   to, the explicit `hostOrigin` target, and an optional `bridgePath`.
 * @returns A promise that resolves once the message has been posted. It does not
 *   await the opener's reaction.
 */
export async function runPopupFlow(deps: PopupFlowDeps): Promise<void> {
  const fetchFn =
    deps.fetch ??
    (globalThis as unknown as {
      fetch: (input: string) => Promise<ResponseLike>;
    }).fetch;
  const bridgePath = deps.bridgePath ?? DEFAULT_BRIDGE_PATH;

  let message: AuthSuccessMessage | AuthErrorMessage;
  try {
    const res = await fetchFn(bridgePath);
    if (!res.ok) {
      message = error("bridge-not-ok");
    } else {
      const body = (await res.json()) as { code?: unknown };
      const code = body?.code;
      if (typeof code === "string" && code.length > 0) {
        message = { source: MESSAGE_SOURCE, type: "auth-success", code };
      } else {
        message = error("missing-code");
      }
    }
  } catch {
    // Network failure or malformed JSON — surface a structured error, never an
    // uncaught throw, so the opener can distinguish failure from a hung popup.
    message = error("bridge-fetch-failed");
  }

  // The second argument is the EXPLICIT host origin — never the wildcard "*".
  deps.opener.postMessage(message, deps.hostOrigin);
}

/** Build the structured error message with a short, opaque reason. */
function error(reason: string): AuthErrorMessage {
  return { source: MESSAGE_SOURCE, type: "auth-error", reason };
}
