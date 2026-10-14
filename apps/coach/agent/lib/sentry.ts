import * as Sentry from "@sentry/node";

const FLUSH_TIMEOUT_MS = 2000;

let initialized = false;

/**
 * Logs `error` and sends it to Sentry tagged with `tags` (session and turn
 * ids), waiting for delivery so a serverless instance that freezes afterwards
 * doesn't drop it. Without SENTRY_DSN, Sentry stays disabled and failures
 * only reach the logs.
 */
export const reportError = async (
  error: unknown,
  tags: Record<string, string | undefined> = {}
): Promise<void> => {
  console.error(error, tags);
  if (!initialized) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
    initialized = true;
  }
  Sentry.captureException(error, { tags });
  await Sentry.flush(FLUSH_TIMEOUT_MS);
};
