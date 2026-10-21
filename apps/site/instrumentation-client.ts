import { resolveObservabilityConfig, scrubEvent } from "@fitme/observability";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
  api_host: "/ingest",
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  debug: process.env.NODE_ENV === "development",
  defaults: "2025-05-24",
  ui_host: "https://eu.posthog.com",
});

// Browser errors and page-load traces to fitme-site. next.config.ts inlines
// VERCEL_ENV and the commit at build time; without a DSN (local) nothing is
// sent.
const sentryConfig = resolveObservabilityConfig({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  env: {
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  },
});

if (sentryConfig.enabled) {
  Sentry.init({
    beforeSend: scrubEvent,
    // No web vitals (Vercel Speed Insights has them): whatever pageload
    // measurements the SDK still takes are dropped with the rest
    beforeSendTransaction: (event) =>
      scrubEvent({ ...event, measurements: {} }),
    // Nothing that could carry User data: no cookies, headers, bodies, query
    // strings (UTM and the like) or user info
    dataCollection: {
      cookies: false,
      httpBodies: [],
      httpHeaders: false,
      urlQueryParams: false,
      userInfo: false,
    },
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    integrations: [
      Sentry.browserTracingIntegration({
        enableLongTask: false,
        webVitals: { ignore: ["cls", "inp", "lcp"] },
      }),
    ],
    release: sentryConfig.release,
    // Whole transactions, not streamed spans, so beforeSendTransaction (the
    // scrubber) sees every one
    traceLifecycle: "static",
    // The site calls no backend of ours, so no request gets trace headers
    tracePropagationTargets: [],
    tracesSampleRate: sentryConfig.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
