import * as Sentry from "@sentry/node";

import { resolveObservabilityConfig } from "./config";
import { sanitizeError } from "./sanitize";
import { sdkOptions } from "./sdk-options";

const FLUSH_TIMEOUT_MS = 2000;

export interface ObservabilityOptions {
  /** The app reporting (`webhooks`, `api`, …), tagged on every event. */
  service: string;
  /**
   * Whether the SDK traces (spans, trace headers). Off for an app that traces
   * through its own OpenTelemetry pipeline (Arnold: eve's), so the two never
   * instrument the same runtime twice. Default on.
   */
  tracing?: boolean;
}

/**
 * Starts error reporting and tracing for a Node app. Call it once at process
 * startup, before the app is built. Without SENTRY_DSN (local runs, tests,
 * CI) it does nothing, so nothing is sent.
 */
export const initObservability = ({
  service,
  tracing = true,
}: ObservabilityOptions): void => {
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

  const options: Sentry.NodeOptions = {
    ...sdkOptions(config),
    initialScope: { tags: { service } },
  };

  if (!tracing) {
    // Without tracing: no spans and no trace headers on outgoing requests
    options.tracePropagationTargets = [];
    options.tracesSampleRate = undefined;
  }

  Sentry.init(options);
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

/** A scheduled job's Sentry cron monitor, created by its first check-in. */
export interface CronMonitor {
  /** Minutes after its scheduled time before a run counts as missed. */
  checkinMarginMinutes: number;
  /** Minutes a run may take before it counts as failed. */
  maxRuntimeMinutes: number;
  /** A crontab expression, the one the scheduler runs the job on. */
  schedule: string;
  slug: string;
  /** The timezone of `schedule`: schedules run in UTC. */
  timezone: "UTC";
}

/**
 * Sends one check-in and waits for its delivery, answering its id. Never
 * throws: a check-in that can't be sent is logged, and the job goes on.
 */
const checkIn = async (
  monitor: CronMonitor,
  values: Parameters<typeof Sentry.captureCheckIn>[0]
): Promise<string | undefined> => {
  if (!Sentry.isEnabled()) {
    return;
  }

  let id: string | undefined;

  try {
    // The schedule goes with every check-in, so the last one creates the
    // monitor when the first never arrived
    id = Sentry.captureCheckIn(values, {
      checkinMargin: monitor.checkinMarginMinutes,
      maxRuntime: monitor.maxRuntimeMinutes,
      schedule: { type: "crontab", value: monitor.schedule },
      timezone: monitor.timezone,
    });
    await Sentry.flush(FLUSH_TIMEOUT_MS);
  } catch (error) {
    console.error("Cron check-in failed", error);
  }

  return id;
};

/**
 * Runs a scheduled job inside its Sentry cron monitor: checks in when it
 * starts and again when it ends, as ok or failed, so Sentry alerts on a missed
 * or failed run. Each check-in's delivery is waited for (2 s at most, so the
 * function can't freeze first and a short run's two arrive in order) and
 * carries the slug, status, duration and schedule, plus what the SDK stamps on
 * any check-in (environment, release, trace ids); never the error, which the
 * job reports itself. Answers the run's value or rejects with its error,
 * whatever becomes of the check-ins. Before `initObservability` (or without a
 * DSN) the job just runs.
 */
export const runMonitored = async <T>(
  monitor: CronMonitor,
  run: () => Promise<T>
): Promise<T> => {
  const monitorSlug = monitor.slug;

  const checkInId = await checkIn(monitor, {
    monitorSlug,
    status: "in_progress",
  });

  const startedAt = performance.now();

  const end = async (status: "ok" | "error") => {
    const duration = (performance.now() - startedAt) / 1000;

    await checkIn(
      monitor,
      checkInId
        ? { checkInId, duration, monitorSlug, status }
        : { monitorSlug, status }
    );
  };

  let value: T;

  try {
    value = await run();
  } catch (error) {
    await end("error");
    throw error;
  }

  await end("ok");

  return value;
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

/**
 * A variable an app needs, or a renamed one with its pre-rename names, any of
 * which will do (`["NEW_NAME", "OLD_NAME"]`), as the app itself reads it.
 */
export type RequiredEnv = string | readonly [string, ...string[]];

/** A required environment variable missing or empty on production. */
export class MissingEnvError extends Error {
  override readonly name = "MissingEnvError";
}

interface ReportMissingEnvOptions {
  /** Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** Defaults to `reportError`. */
  report?: (
    error: MissingEnvError,
    tags?: Record<string, string>
  ) => Promise<void>;
}

/**
 * Reports each of `required` that's missing or empty, one error per variable
 * (tagged `env_var`), and answers their names. Only on Vercel production
 * (`VERCEL_ENV=production`): elsewhere an unset variable is often on purpose.
 * Call it at startup, after `initObservability`, so a deployment whose env was
 * lost shows up in Sentry before the first request fails on it. It reports
 * and never throws: the app still starts and answers as it does without it.
 */
export const reportMissingEnv = async (
  required: readonly RequiredEnv[],
  { env = process.env, report = reportError }: ReportMissingEnvOptions = {}
): Promise<string[]> => {
  if (env.VERCEL_ENV !== "production") {
    return [];
  }

  const missing = required.flatMap((entry) => {
    const names = [entry].flat();

    return names.some((name) => (env[name] ?? "") !== "") ? [] : [names];
  });

  await Promise.all(
    missing.map(async ([name, ...fallbacks]) => {
      const label = fallbacks.length
        ? `${name} (or ${fallbacks.join(", ")})`
        : name;

      await report(
        new MissingEnvError(`Missing ${label} environment variable`),
        { env_var: name }
      );
    })
  );

  return missing.map(([name]) => name);
};
