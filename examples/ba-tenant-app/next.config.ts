import type { NextConfig } from "next";

// The separate host-shell origin permitted to frame this app. This app is meant
// to be embedded as a cross-site iframe by exactly one trusted host; the framing
// policy below names that origin and nothing else. Falls back to a placeholder so
// a fresh checkout still emits a well-formed, non-wide-open policy.
const HOST_SHELL_ORIGIN =
  process.env.HOST_SHELL_ORIGIN ?? "https://your-host-shell.vercel.app";

// Content-Security-Policy frame-ancestors: who may embed this app in a frame.
//
// 'self' (same-origin, e.g. the /auth/popup window) plus the ONE trusted
// host-shell origin. This is deliberately neither wide-open (no wildcard, which
// would invite clickjacking from any site) nor a lockout ('none' /
// X-Frame-Options DENY, which would block the legitimate cross-site host and
// defeat the whole demo). Naming the single host-shell origin is the right
// middle ground.
const frameAncestors = `frame-ancestors 'self' ${HOST_SHELL_ORIGIN}`;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: frameAncestors,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
