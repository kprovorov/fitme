import { sanitizeError } from "@fitme/observability";
import { reportError } from "@fitme/observability/node";
import { handleSchedule } from "@vercel/schedules";

import type { Job } from "./job.js";

interface HandlerDeps {
  reportError: (error: unknown) => Promise<void>;
}

const DEFAULT_DEPS: HandlerDeps = { reportError };

/**
 * The handler of a private scheduled function: runs `job` for a schedule's
 * call. A failure is reported, then thrown on, so the run fails in Vercel's
 * execution history; nothing retries it but the next run. What's thrown is
 * what `reportError` sends (`sanitizeError`), since Vercel logs it.
 */
export const createHandler = (
  job: Job,
  { reportError: report }: HandlerDeps = DEFAULT_DEPS
): ((request: Request) => Promise<Response>) =>
  handleSchedule(async () => {
    try {
      await job();
    } catch (error) {
      await report(error);

      throw sanitizeError(error).error;
    }
  });
