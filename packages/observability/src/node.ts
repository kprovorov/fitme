import * as Sentry from "@sentry/node";
import { resolveObservabilityConfig } from "./config";
import { tracePropagationTargets } from "./propagation";
import { SECRET_HEADERS, scrubEvent } from "./scrub";

const FLUSH_TIMEOUT_MS = 2000;

export interface ObservabilityOptions {
  /** The app reporting (`webhooks`, `api`, …), tagged on every event. */
  service: string;
}

/**
 * Starts error reporting and tracing for a Node app. Call it once at process
 * startup, before the app is built. Without SENTRY_DSN (local runs, tests,
 * CI) it does nothing, so nothing is sent.
 */
export const initObservability = ({ service }: ObservabilityOptions): void => {
  const config = resolveObservabilityConfig({
    dsn: process.env.SENTRY_DSN,
    env: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    },
  });
  if (!config.enabled) {
    return;
  }
  Sentry.init({
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
    // SDK 11's replacement for `sendDefaultPii: false`, stricter than its
    // defaults: nothing that could carry a token, a body or User data
    dataCollection: {
      cookies: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      httpBodies: [],
      httpHeaders: { request: { deny: SECRET_HEADERS }, response: false },
      stackFrameVariables: false,
      userInfo: false,
    },
    dsn: config.dsn,
    environment: config.environment,
    initialScope: { tags: { service } },
    release: config.release,
    // Whole transactions, not streamed spans, so beforeSendTransaction (the
    // scrubber) sees every one
    traceLifecycle: "static",
    tracePropagationTargets,
    tracesSampleRate: config.tracesSampleRate,
  });
};

/**
 * Logs `error` and sends it, with `tags`, waiting for delivery so a serverless
 * instance that freezes after the response doesn't drop it. Before
 * `initObservability` (or without a DSN) it only logs.
 */
export const reportError = async (
  error: unknown,
  tags?: Record<string, string>
): Promise<void> => {
  console.error(error);
  Sentry.captureException(error, { tags });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
};

/**
 * Request spans for a Hono app: register it first, `app.use(observeHono(app))`.
 * Works whether or not Hono was loaded before `initObservability` (bundled apps
 * import it first), and does nothing when observability is off.
 */
export const observeHono: typeof Sentry.honoMiddleware = (app, options) =>
  Sentry.honoMiddleware(app, options);
