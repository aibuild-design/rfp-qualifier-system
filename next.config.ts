import type { NextConfig } from "next";

// Invite-only internal tool holding Caravann's live bid pipeline, so the
// headers are tighter than a public marketing site would want.
//
// 'unsafe-inline' on styles is required by Tailwind v4's runtime style
// injection. Scripts get 'unsafe-inline' too because Next's App Router
// bootstraps hydration with inline scripts and has no nonce story that works
// with static prerendering; the practical mitigation is that this app renders
// no user-supplied HTML anywhere, so there is no injection sink to reach.
// Revisit if that stops being true.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Supabase over HTTPS + its realtime socket. No wildcard: an exfiltration
  // attempt to an attacker-controlled host is blocked by the browser.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Nothing here should ever be indexed - it is a private bid pipeline.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Belt and braces: the API is same-origin only and must never be cached
        // by a proxy that could then serve one tenant's data to another.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
