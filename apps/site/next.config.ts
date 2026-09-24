import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not regenerate AGENTS.md/CLAUDE.md on every dev run; the repo root owns those.
  agentRules: false,
  headers() {
    return Promise.resolve([
      {
        headers: [{ key: "Content-Type", value: "application/json" }],
        source: "/.well-known/apple-app-site-association",
      },
    ]);
  },
  images: {
    remotePatterns: [{ hostname: "github.com", protocol: "https" }],
  },
  reactStrictMode: true,
  // Proxy PostHog through the site so ad blockers do not drop analytics.
  rewrites() {
    return Promise.resolve([
      {
        destination: "https://eu-assets.i.posthog.com/static/:path*",
        source: "/ingest/static/:path*",
      },
      {
        destination: "https://eu.i.posthog.com/:path*",
        source: "/ingest/:path*",
      },
    ]);
  },
  // Required to support PostHog trailing slash API requests.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
