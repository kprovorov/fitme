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
const sentry = resolveObservabilityConfig({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  env: {
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  },
});

if (sentry.enabled) {
  Sentry.init({
    beforeSend: scrubEvent,
    // No web vitals (Vercel Speed Insights has them): whatever pageload
    // measurements the SDK still takes are dropped with the rest
    beforeSendTransaction: (event) =>
      scrubEvent({ ...event, measurements: {} }),
    dataCollection: { cookies: false, userInfo: false },
    dsn: sentry.dsn,
    environment: sentry.environment,
    integrations: [
      Sentry.browserTracingIntegration({
        enableInp: false,
        enableLongTask: false,
      }),
      // Registered by hand so browserTracingIntegration doesn't add one that
      // tracks CLS, LCP and INP
      Sentry.webVitalsIntegration({ ignore: ["cls", "inp", "lcp"] }),
    ],
    release: sentry.release,
    // Whole transactions, not streamed spans, so beforeSendTransaction (the
    // scrubber) sees every one
    traceLifecycle: "static",
    // The site calls no backend of ours, so no request gets trace headers
    tracePropagationTargets: [],
    tracesSampleRate: sentry.tracesSampleRate,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
