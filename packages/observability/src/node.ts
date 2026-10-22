import * as Sentry from "@sentry/node";
import { resolveObservabilityConfig } from "./config";
import { sanitizeError } from "./sanitize";
import { sdkOptions } from "./sdk-options";

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
    ...sdkOptions(config),
    initialScope: { tags: { service } },
  });
};

/**
 * Logs `error` and sends it, with `tags`, waiting for delivery so a serverless
 * instance that freezes after the response doesn't drop it. Before
 * `initObservability` (or without a DSN) it only logs. A failed database
 * query is logged and sent as `sanitizeError` makes it: the SQLSTATE (also a
 * `sqlstate` tag) and stack frames, never the SQL, its parameters or the
 * Postgres message.
 */
export const reportError = async (
  error: unknown,
  tags?: Record<string, string>
): Promise<void> => {
  const sanitized = sanitizeError(error);
  console.error(sanitized.error);
  Sentry.captureException(sanitized.error, {
    tags: sanitized.tags ? { ...tags, ...sanitized.tags } : tags,
  });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
};

/**
 * Identifies the current request's User by their Clerk id, and nothing else,
 * on its events and traces. Call it only with an id from a verified token,
 * inside the request (each request has its own scope); a request from no User
 * (a server caller) doesn't call it.
 */
export const identifyUser = (userId: string): void => {
  Sentry.setUser({ id: userId });
};

/**
 * Request spans for a Hono app: register it first, `app.use(observeHono(app))`.
 * Works whether or not Hono was loaded before `initObservability` (bundled apps
 * import it first), and does nothing when observability is off.
 */
export const observeHono: typeof Sentry.honoMiddleware = (app, options) =>
  Sentry.honoMiddleware(app, options);
