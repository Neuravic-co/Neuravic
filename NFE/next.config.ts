import type { NextConfig } from "next";

/**
 * Baseline security headers for every page.
 *
 * `frame-ancestors 'none'` stops other sites embedding the portal (clickjacking), `base-uri` and
 * `form-action` limit injected markup, and `object-src` blocks plugins. A full `script-src` policy is
 * not set yet because the framework injects inline scripts; see Security/hardening-checklist.md.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    // The root path is listed explicitly: "/:path*" does not match "/" in the vinext router.
    return [
      { source: "/", headers: securityHeaders },
      { source: "/:path*", headers: securityHeaders },
      // Brand images keep their file names, so they cannot be cached forever; a day, then refresh quietly.
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
};

export default nextConfig;
