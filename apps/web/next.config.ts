import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not regenerate AGENTS.md/CLAUDE.md on every dev run; the repo root owns those.
  agentRules: false,
  // Vercel's environment and commit, inlined for the browser's Sentry
  // environment and release (lib/observability.ts).
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
  // public/.well-known/apple-app-site-association has no extension, and
  // Apple only reads it as JSON (iOS associated domains: password AutoFill
  // and Handoff).
  headers() {
    return Promise.resolve([
      {
        headers: [{ key: "Content-Type", value: "application/json" }],
        source: "/.well-known/apple-app-site-association",
      },
    ]);
  },
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, so Next compiles them in place.
  transpilePackages: ["@fitme/core", "@fitme/observability", "@fitme/supabase"],
};

// Uploads the build's source maps to SENTRY_ORG / SENTRY_PROJECT for the
// release (VERCEL_GIT_COMMIT_SHA) with SENTRY_AUTH_TOKEN, then deletes them
// from the output. Without the token (local, CI) the upload is skipped and
// the build still succeeds.
export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
  silent: !process.env.CI,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  telemetry: false,
});
