// /install-pwa — inert PWA installation entry point.
//
// This page is SCAFFOLDING ONLY. It is the v0.2 "install as a native-shell PWA"
// entry point, present today so the installation surface exists and is
// documented — but it is NOT wired to any native auth flow. It registers no
// service worker and imports nothing from the bridge auth surface; it only
// links the per-tenant manifest routes. The "Mode B preview — not wired" label
// below is deliberately unambiguous so no reader mistakes this inert page for a
// working native sign-in flow.

// Demo tenants surfaced under /t/<tenant> — each has its own dynamic manifest.
const DEMO_TENANTS = ["acme", "globex"] as const;

export default function InstallPwaPage() {
  return (
    <main style={{ maxWidth: "42rem", margin: "0 auto", padding: "2rem" }}>
      <p
        style={{
          display: "inline-block",
          padding: "0.25rem 0.6rem",
          borderRadius: "0.375rem",
          border: "1px solid #b45309",
          color: "#b45309",
          fontWeight: 600,
          fontSize: "0.85rem",
          letterSpacing: "0.02em",
        }}
      >
        Mode B preview — not wired
      </p>

      <h1>Install as a PWA</h1>

      <p>
        This is the entry point for installing the example as a native-shell PWA
        (the v0.2 transport). It is present today as <strong>inert
        scaffolding</strong> so the installation surface and its per-tenant
        manifests exist and can be inspected.
      </p>

      <p>
        Nothing on this page performs authentication. It registers no service
        worker and wires no native sign-in flow — it only links each tenant&apos;s
        dynamic web app manifest so you can see the per-tenant{" "}
        <code>application/manifest+json</code> output. The popup-based transport
        (Mode A) is the only wired auth flow in this example.
      </p>

      <h2>Per-tenant manifests</h2>
      <ul>
        {DEMO_TENANTS.map((tenant) => (
          <li key={tenant}>
            <a href={`/t/${tenant}/manifest.webmanifest`}>
              {tenant} — manifest.webmanifest
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
