import { withService } from "@fitme/db";
import { reportError } from "@fitme/observability/node";
import {
  closeForgottenWorkoutSession,
  listForgottenWorkoutSessions,
} from "@fitme/services/workout-sessions";
import type { CloseForgottenWorkoutSessionResult } from "@fitme/services/workout-sessions";

import type { Job } from "../job.js";
import { AlreadyReportedError } from "../reported.js";

/**
 * How long into a run a new Workout Session may still be closed: well inside
 * the function's time limit (`maxDuration` in vercel.json, 300 s), so a run
 * never dies mid-close. What's left is the next run's.
 */
export const RUN_BUDGET_MS = 240_000;

type CloseStatus = CloseForgottenWorkoutSessionResult["status"];

export interface ForgottenWorkoutSessionsDeps {
  /** Closes one Workout Session in a transaction of its own. */
  closeSession: (sessionId: string) => Promise<CloseStatus>;
  /** The ids of every Forgotten Workout Session, in one transaction. */
  listSessions: () => Promise<readonly string[]>;
  log: (message: string) => void;
  /** Milliseconds on a monotonic clock. */
  now: () => number;
  reportError: (error: unknown, tags?: Record<string, string>) => Promise<void>;
}

/** The real dependencies: the services through withService, Sentry, the console. */
const defaultDeps = (): ForgottenWorkoutSessionsDeps => ({
  closeSession: async (sessionId) => {
    const { status } = await withService(
      async (tx) => await closeForgottenWorkoutSession(tx, sessionId)
    );

    return status;
  },
  listSessions: async () =>
    await withService(async (tx) => await listForgottenWorkoutSessions(tx)),
  log: (message) => {
    console.info(message);
  },
  now: () => performance.now(),
  reportError,
});

/** What became of one listed Workout Session. */
type Outcome = "discarded" | "failed" | "finished" | "leftAlone";

export interface ForgottenWorkoutSessionsSummary {
  discarded: number;
  failed: number;
  finished: number;
  leftAlone: number;
  listed: number;
  /** Listed, but not tried before the run's budget ran out. */
  postponed: number;
}

/**
 * Closes every Forgotten Workout Session (ADR 0024): lists them, then closes
 * them one after another, each in its own transaction, so one that fails is
 * reported and the rest still close; the next run tries it again. A run that
 * nears the function's time limit starts no new close, and the next run takes
 * the rest.
 *
 * Every close checks again under its own row lock, so overlapping, repeated
 * and late runs are harmless: a Workout Session another run closed, or one
 * with a set logged since the list, is left alone.
 *
 * It logs and reports ids and counts only. A failing list rejects; so does a
 * run where any close failed, after the rest (each already reported).
 */
export const forgottenWorkoutSessions = (
  {
    closeSession,
    listSessions,
    log,
    now,
    reportError: report,
  }: ForgottenWorkoutSessionsDeps = defaultDeps()
): Job => {
  const closeOne = async (sessionId: string): Promise<Outcome> => {
    try {
      const status = await closeSession(sessionId);

      return status === "left_alone" ? "leftAlone" : status;
    } catch (error) {
      await report(error, { workout_session_id: sessionId });

      return "failed";
    }
  };

  return async () => {
    const startedAt = now();
    const sessionIds = await listSessions();

    const summary: ForgottenWorkoutSessionsSummary = {
      discarded: 0,
      failed: 0,
      finished: 0,
      leftAlone: 0,
      listed: sessionIds.length,
      postponed: 0,
    };

    for (const [index, sessionId] of sessionIds.entries()) {
      if (now() - startedAt >= RUN_BUDGET_MS) {
        summary.postponed = sessionIds.length - index;
        break;
      }

      // One after another, each in its own transaction: a run holds one
      // connection, and a Workout Session's close never waits on another's.
      // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential on purpose
      const outcome = await closeOne(sessionId);
      summary[outcome] += 1;
    }

    log(
      `forgotten-workout-sessions: ${summary.listed} listed, ` +
        `${summary.finished} finished, ${summary.discarded} discarded, ` +
        `${summary.leftAlone} left alone, ${summary.failed} failed, ` +
        `${summary.postponed} postponed`
    );

    if (summary.failed > 0) {
      throw new AlreadyReportedError(
        `${summary.failed} of ${summary.listed} Forgotten Workout Sessions failed to close`
      );
    }
  };
};
