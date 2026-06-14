"use client";

// The /auth/popup entry — dual-role, classified by SESSION (not window.opener,
// which a navigation can transiently null).
//
// ROLE 1 — the real top-level popup (opened by the launcher):
//   In a real enterprise embed the host has already signed the user in under the
//   same identity provider, so a top-level tenant session already exists. The
//   popup probes /auth/bridge, gets a one-time handle, postMessages it to its
//   opener, and self-closes — the production flow. It NEVER navigates itself: a
//   redirect would null window.opener and the handle could never be delivered.
//
// ROLE 2 — the in-iframe "popup entry" (no session, embedded):
//   The bridge middleware rewrites an unauthenticated embedded (iframe) request
//   here. It renders the launcher so the user can open the real top-level popup.
//
// Classification is SESSION-FIRST: warm (bridge 200) => Role 1, deliver; not warm
// (401) => Role 2 launcher when embedded, or a "sign in to the host first" notice
// when this is a top-level popup with no host session. window.opener is never
// used to classify — it is only the postMessage target, captured once up front.

import { useEffect, useState } from "react";
import { runPopupFlow } from "next-auth-bridge";
import { SignInLauncher } from "../sign-in-launcher";

// The Auth.js session endpoint — reports auth state WITHOUT side effects. We use
// this (not a /auth/bridge probe) to decide warm/not-warm: /auth/bridge MINTS a
// one-time handle on every authenticated GET, so probing it just to read a status
// would orphan a code in the store. runPopupFlow hits /auth/bridge exactly once,
// to mint the single handle we actually deliver.
const SESSION_PATH = "/api/auth/session";

// The exact app origin the opener runs on — the postMessage receiver pin.
function hostOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_ORIGIN ?? window.location.origin;
}

// Is this document embedded in a frame (the in-iframe popup entry) rather than a
// real top-level popup? A reliable signal (unlike window.opener): a cross-origin
// `top` access throws, which itself confirms embedding.
function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

// Does a top-level tenant session already exist? Ask Auth.js directly via its
// session endpoint (the same one `useSession` reads). It returns the session
// object when authenticated and `null`/`{}` otherwise — and, crucially, mints
// nothing. No SessionProvider is needed for this plain fetch.
async function hasSession(): Promise<boolean> {
  try {
    const res = await fetch(SESSION_PATH, { cache: "no-store" });
    if (!res.ok) return false;
    const session = (await res.json()) as { user?: unknown } | null;
    return Boolean(session?.user);
  } catch {
    // Could not determine — treat as not warm rather than attempt a delivery.
    return false;
  }
}

type Mode =
  | { kind: "checking" }
  | { kind: "delivering" }
  | { kind: "popup-entry" }
  | { kind: "not-warm" };

export default function PopupPage(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>({ kind: "checking" });

  useEffect(() => {
    // Capture the opener ONCE, up front. This popup never navigates itself, so
    // nothing nulls it after this point — it stays valid as the postMessage target.
    const opener = window.opener as Window | null;

    void (async () => {
      // SESSION FIRST — the reliable role signal (window.opener can be null).
      const warm = await hasSession();

      // Warm => real popup: deliver the handle to the opener and self-close.
      if (warm) {
        if (!opener) {
          // Warm but no opener: the handle has nowhere to go. This should not
          // happen once the popup keeps its opener (no self-navigation). Surfaced
          // rather than silently closing on a lost handoff.
          setMode({ kind: "not-warm" });
          return;
        }
        setMode({ kind: "delivering" });
        await runPopupFlow({
          opener: opener as unknown as {
            postMessage(data: unknown, targetOrigin: string): void;
          },
          // The exact app origin the opener runs on — the postMessage receiver pin.
          hostOrigin: hostOrigin(),
          // fetch + bridgePath default to the global fetch and "/auth/bridge".
        });
        // The handle is posted; this popup has served its purpose. Self-close,
        // matching production (the opener then drives /auth/consume).
        window.close();
        return;
      }

      // Not warm + embedded => the in-iframe popup entry: render the launcher so
      // the user can open the real top-level popup.
      if (isEmbedded()) {
        setMode({ kind: "popup-entry" });
        return;
      }

      // Not warm + top-level => a real popup with no host session. Do NOT loop into
      // a launcher (that would reopen a popup) and do NOT redirect. Tell the user
      // to sign into the host first.
      setMode({ kind: "not-warm" });
    })();
  }, []);

  // In-iframe popup entry: present the launcher.
  if (mode.kind === "popup-entry") {
    return (
      <main style={{ maxWidth: 480, margin: "3rem auto", lineHeight: 1.5 }}>
        <p>
          Sign in to continue. This opens a brief top-level window that reads your
          existing host session, then returns you here signed in.
        </p>
        <SignInLauncher />
      </main>
    );
  }

  // Top-level popup with no host session to bridge — tell the user to sign into
  // the host first. (We never run an interactive login in the popup.)
  if (mode.kind === "not-warm") {
    return (
      <main style={{ maxWidth: 480, margin: "3rem auto", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: "1.1rem" }}>Sign in to the app first</h1>
        <p>
          This popup reads an existing tenant-app session and bridges it into the
          embedded frame — but there is no session yet, so there is nothing to
          bridge.
        </p>
        <p>
          In a real deployment your enterprise host has already signed you into
          this app under the same identity provider. For this demo, open the
          tenant app directly (on its own origin), sign in there once, then return
          to the embedded view — this popup will read that session and finish
          sign-in.
        </p>
      </main>
    );
  }

  // checking / delivering — status copy until the effect self-closes.
  return <p>Completing sign-in…</p>;
}
