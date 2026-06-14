// Force every /auth/* page to render dynamically (never prerendered/CDN-cached).
//
// WHY THIS MATTERS for the popup bridge: a statically prerendered page is served
// by Vercel from the edge cache with `Content-Disposition: inline` (and as a
// cached static document). A browser loads such a response in an OPENER-LESS
// browsing context — `window.opener` is null in the opened popup. The popup
// bridge needs `window.opener` to be the embedding app window so it can
// postMessage the one-time handle back to it; with a null opener the handoff
// cannot complete. Rendering /auth/popup dynamically makes Vercel serve it like
// any per-request document (no Content-Disposition, no static cache), so the
// popup keeps its opener and the postMessage handoff works.
//
// This is a routing/serving concern only — it does not touch the bridge/consume
// security model.
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
