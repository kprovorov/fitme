import * as Sentry from "@sentry/node";

const FLUSH_TIMEOUT_MS = 2000;

let initialized = false;

/**
 * Logs `error` and sends it to Sentry, waiting for delivery so a serverless
 * instance that freezes after the response doesn't drop it. Without
 * SENTRY_DSN, Sentry stays disabled and failures only reach the logs.
 */
export const reportError = async (error: unknown): Promise<void> => {
  console.error(error);
  if (!initialized) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
    initialized = true;
  }
  Sentry.captureException(error);
  await Sentry.flush(FLUSH_TIMEOUT_MS);
};
