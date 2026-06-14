import type { NextConfig } from "next";

// Minimal Next.js config for the host-shell. This app's only job is to embed the
// tenant app as a cross-site iframe, so no special bundler transforms are needed.
const nextConfig: NextConfig = {};

export default nextConfig;
