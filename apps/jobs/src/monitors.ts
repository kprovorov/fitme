import type { CronMonitor } from "@fitme/observability/node";

/**
 * The forgotten-workout-sessions job's Sentry cron monitor. Its `schedule` is
 * the one in vercel.json (a test holds them equal). The margin allows for
 * Vercel's jitter, at most 15 minutes, and its delivery delays; the runtime
 * for the function's `maxDuration` (300 s), plus a minute.
 */
export const FORGOTTEN_WORKOUT_SESSIONS_MONITOR: CronMonitor = {
  checkinMarginMinutes: 15,
  maxRuntimeMinutes: 6,
  schedule: "*/10 * * * *",
  slug: "forgotten-workout-sessions",
  timezone: "UTC",
};
