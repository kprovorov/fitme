import {
  resolveObservabilityConfig,
  SECRET_HEADERS,
  scrubEvent,
  tracePropagationTargets,
} from "@fitme/observability";

/**
 * The Sentry options the browser, Node and edge runtimes share, from
 * @fitme/observability's rules: the fitme-web DSN, environment, release and
 * sampling, the scrubber, and trace headers to our own services only.
 * Without NEXT_PUBLIC_SENTRY_DSN (local, CI) nothing is sent.
 *
 * Each variable is read by its literal name, so Next inlines it into the
 * browser bundle (next.config.ts exposes Vercel's two under NEXT_PUBLIC_).
 */
export const sentryOptions = () => {
  const config = resolveObservabilityConfig({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    env: {
      VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
      VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    },
  });
  return {
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    // As in @fitme/observability/node: nothing that could carry a token, a
    // body or User data
    dataCollection: {
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: { deny: SECRET_HEADERS }, response: false },
      stackFrameVariables: false,
      userInfo: false,
    },
    dsn: config.dsn,
    enabled: config.enabled,
    environment: config.environment,
    release: config.release,
    // Whole transactions, not streamed spans, so beforeSendTransaction (the
    // scrubber) sees every one
    traceLifecycle: "static" as const,
    tracePropagationTargets,
    tracesSampleRate: config.tracesSampleRate,
  };
};
