import { resolveObservabilityConfig, sdkOptions } from "@fitme/observability";

/**
 * The Sentry options the browser, Node and edge runtimes share:
 * @fitme/observability's for the fitme-web DSN (environment, release,
 * sampling, the scrubber, data collection, trace headers to our own services
 * only). Without NEXT_PUBLIC_SENTRY_DSN (local, CI) nothing is sent.
 *
 * Each variable is read by its literal name, so Next inlines it into the
 * browser bundle (next.config.ts exposes Vercel's two under NEXT_PUBLIC_).
 */
export const sentryOptions = () =>
  sdkOptions(
    resolveObservabilityConfig({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      env: {
        VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
        VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      },
    })
  );
