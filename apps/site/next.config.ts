import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not regenerate AGENTS.md/CLAUDE.md on every dev run; the repo root owns those.
  agentRules: false,
  // Read by instrumentation-client.ts: the Sentry environment and release
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
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
  // Workspace packages ship TypeScript source
  transpilePackages: ["@fitme/observability"],
};

// Source maps for the commit's release go to fitme-site (SENTRY_ORG,
// SENTRY_PROJECT, SENTRY_AUTH_TOKEN, set on Vercel by the Sentry integration)
// and are deleted from the output; without a token the upload is skipped and
// the build still succeeds. Browser only: no server SDK, so nothing on the
// server is instrumented.
export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  buildTimeInstrumentation: false,
  errorHandler: (error: Error) => {
    console.warn("Sentry source map upload failed:", error);
  },
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
  webpack: {
    autoInstrumentAppDirectory: false,
    autoInstrumentMiddleware: false,
    autoInstrumentServerFunctions: false,
  },
});
