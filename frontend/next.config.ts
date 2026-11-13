import type { NextConfig } from "next";

/**
 * The browser only talks to this Next.js server. /api/v1/* and /uploads/* are forwarded to the
 * NestJS backend, so the httpOnly auth cookies are same-origin (no CORS, no tokens in JS).
 */
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** Static security headers for every response; the CSP (with a per-request nonce) is set in proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Older browsers; modern ones use the CSP frame-ancestors 'none' from proxy.ts.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), " +
      "magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone (node server.js) for systemd (README.md §4).
  output: "standalone",
  reactCompiler: true,
  poweredByHeader: false,
  // No icon badge from Next.js in development either (no icons in the UI, SPEC.md §13.5).
  devIndicators: false,
  turbopack: {
    // This folder is the project root (a stray lockfile higher up must not be picked up).
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${backendUrl}/api/v1/:path*` },
      { source: "/uploads/:path*", destination: `${backendUrl}/uploads/:path*` },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
