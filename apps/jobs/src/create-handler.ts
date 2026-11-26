import { sanitizeError } from "@fitme/observability";
import { reportError, runMonitored } from "@fitme/observability/node";
import type { CronMonitor } from "@fitme/observability/node";
import { handleSchedule } from "@vercel/schedules";

import type { Job } from "./job.js";
import { AlreadyReportedError } from "./reported.js";

interface HandlerDeps {
  reportError: (error: unknown) => Promise<void>;
  runMonitored: <T>(monitor: CronMonitor, run: () => Promise<T>) => Promise<T>;
}

const DEFAULT_DEPS: HandlerDeps = { reportError, runMonitored };

/**
 * The handler of a private scheduled function: runs `job` for a schedule's
 * call, inside its Sentry cron `monitor`. A failure is reported (unless the
 * job reported its causes itself), then thrown on, so the run fails in
 * Vercel's execution history and for the monitor; nothing retries it but the
 * next run. What's thrown is what `reportError` sends (`sanitizeError`), since
 * Vercel logs it.
 */
export const createHandler = (
  job: Job,
  monitor: CronMonitor,
  { reportError: report, runMonitored: monitored }: HandlerDeps = DEFAULT_DEPS
): ((request: Request) => Promise<Response>) =>
  handleSchedule(async () => {
    try {
      await monitored(monitor, job);
    } catch (error) {
      if (!(error instanceof AlreadyReportedError)) {
        await report(error);
      }

      throw sanitizeError(error).error;
    }
  });
