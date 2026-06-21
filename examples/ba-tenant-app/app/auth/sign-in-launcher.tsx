"use client";

// The shared sign-in launcher — the opener half of the cross-context handoff.
//
// On click this composes the two halves of the handoff:
//   1. openAuthPopup(...) — open the top-level /auth/popup window and await the
//      one-time handle it posts back. The receiver origin is pinned to this app's
//      exact origin via `allowedOrigins`; a message from any other origin (or any
//      window other than the popup we opened) is ignored and never resolves.
//   2. redeemHandle(code, ...) — the single swappable seam that exchanges the
//      handle for the partitioned session cookie via /auth/consume.
//
// After the cookie is set we soft-refresh so the now-authenticated frame re-reads
// the session and reflects the signed-in state. Every distinguishable failure
// mode of the popup flow is surfaced in visible status text.
//
// This launcher is shared by two entry points so the flow lives in exactly one
// place:
//   - /t/[tenant] (signed-out branch) — the legible per-tenant landing page.
//   - /auth/popup (no-opener branch) — the in-iframe "popup entry" the bridge
//     middleware rewrites an unauthenticated embedded request to. Without this,
//     that rewrite would dead-end on an inert page with no way to start sign-in.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openAuthPopup, OpenAuthPopupError } from "next-auth-bridge";
import { redeemHandle } from "@/lib/consume-transport";

// The app's own origin — the postMessage receiver pin and the popup target. In a
// real deploy NEXT_PUBLIC_APP_ORIGIN is the app's https origin; locally it falls
// back to the running origin so the demo still works from localhost.
function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}

// Map a typed popup-flow failure to human-readable status copy.
function describeFailure(reason: OpenAuthPopupError["reason"]): string {
  switch (reason) {
    case "popup-blocked":
      return "The sign-in popup was blocked. Allow popups for this site and try again.";
    case "popup-closed":
      return "The sign-in popup was closed before completing. Try again.";
    case "timeout":
      return "The sign-in popup timed out. Try again.";
    case "auth-error":
      return "Sign-in failed in the popup. Try again.";
  }
}

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "redeeming" }
  | { kind: "error"; message: string };

/**
 * The shared sign-in launcher button. Where it lands after redeeming is
 * configurable: the per-tenant page lands back on the current path; the in-iframe
 * popup entry lands on the tenant route resolved by the caller.
 *
 * @param next Optional post-exchange destination. Defaults to the current
 *   pathname so the per-tenant page refreshes in place.
 */
export function SignInLauncher({ next }: { next?: string }): React.JSX.Element {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSignIn(): Promise<void> {
    setStatus({ kind: "running" });
    try {
      const { code } = await openAuthPopup({
        allowedOrigins: [appOrigin()],
        popupUrl: "/auth/popup",
        // The warm popup reads an existing top-level session and posts the handle
        // back near-instantly (no interactive sign-in). A short, generous window
        // still covers a slow network round-trip to the bridge.
        timeoutMs: 60_000,
      });

      // Exchange the handle for the partitioned cookie through the swappable seam.
      setStatus({ kind: "redeeming" });
      const landing =
        next ??
        (typeof window !== "undefined" ? window.location.pathname : "/");
      await redeemHandle(code, landing);

      // Soft-refresh so the server components re-read the now-present session.
      setStatus({ kind: "idle" });
      router.refresh();
    } catch (err) {
      if (err instanceof OpenAuthPopupError) {
        setStatus({ kind: "error", message: describeFailure(err.reason) });
        return;
      }
      setStatus({
        kind: "error",
        message: "Something went wrong completing sign-in. Try again.",
      });
    }
  }

  const busy = status.kind === "running" || status.kind === "redeeming";

  return (
    <div>
      <button type="button" onClick={() => void onSignIn()} disabled={busy}>
        {status.kind === "running"
          ? "Opening sign-in…"
          : status.kind === "redeeming"
            ? "Completing sign-in…"
            : "Sign in"}
      </button>
      {status.kind === "error" ? (
        <p role="alert" style={{ color: "#b00020" }}>
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
