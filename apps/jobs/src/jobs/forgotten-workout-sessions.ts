import { withService } from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { reportError } from "@fitme/observability/node";
import {
  closeForgottenWorkoutSession,
  listForgottenWorkoutSessions,
} from "@fitme/services/workout-sessions";
import type { CloseForgottenWorkoutSessionResult } from "@fitme/services/workout-sessions";
import { sql } from "drizzle-orm";

import type { Job } from "../job.js";
import { AlreadyReportedError } from "../reported.js";

/**
 * How long into a run a new Workout Session may still be closed: well inside
 * the function's time limit (`maxDuration` in vercel.json, 300 s), so a run
 * never dies mid-close. What's left is the next run's.
 */
export const RUN_BUDGET_MS = 240_000;

/**
 * Longest any one transaction of the job may take, all its statements and
 * lock waits together, so a close started just inside the budget still ends
 * before the time limit (240 + 50 s < 300 s), however long an account deletion
 * holds its table locks. Postgres 17's `transaction_timeout`, which ends the
 * connection too, so a statement alone is bounded sooner, by
 * `STATEMENT_TIMEOUT_MS`, with an ordinary error.
 */
export const TRANSACTION_TIMEOUT_MS = 50_000;
const STATEMENT_TIMEOUT_MS = 20_000;

/**
 * After this many closes failing in a row the run stops: Postgres is likely
 * down, and every report would cost a flush and a Sentry event. The rest are
 * postponed to the next run.
 */
export const MAX_FAILURES_IN_A_ROW = 5;

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

/** `run` in a `withService` transaction of its own, under the timeouts. */
const inTransaction = async <T>(
  run: (tx: Transaction) => Promise<T>
): Promise<T> =>
  await withService(async (tx) => {
    // Set inside the transaction, so its timer starts here, just after BEGIN
    await tx.execute(
      sql`select set_config('transaction_timeout', ${`${TRANSACTION_TIMEOUT_MS}ms`}, true), set_config('statement_timeout', ${`${STATEMENT_TIMEOUT_MS}ms`}, true)`
    );

    return await run(tx);
  });

/** The real dependencies: the services through withService, Sentry, the console. */
const defaultDeps = (): ForgottenWorkoutSessionsDeps => ({
  closeSession: async (sessionId) => {
    const { status } = await inTransaction(
      async (tx) => await closeForgottenWorkoutSession(tx, sessionId)
    );

    return status;
  },
  listSessions: async () =>
    await inTransaction(async (tx) => await listForgottenWorkoutSessions(tx)),
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
  /** Listed, but not tried: the run's budget ran out, or too many failed in a row. */
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
      try {
        await report(error, { workout_session_id: sessionId });
      } catch {
        // A report that fails never stops the run; the run still fails
        console.error("Reporting a failed close failed");
      }

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

    let failuresInARow = 0;

    for (const [index, sessionId] of sessionIds.entries()) {
      if (
        now() - startedAt >= RUN_BUDGET_MS ||
        failuresInARow >= MAX_FAILURES_IN_A_ROW
      ) {
        summary.postponed = sessionIds.length - index;
        break;
      }

      // One after another, each in its own transaction: a run holds one
      // connection, and a Workout Session's close never waits on another's.
      // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- sequential on purpose
      const outcome = await closeOne(sessionId);
      summary[outcome] += 1;
      failuresInARow = outcome === "failed" ? failuresInARow + 1 : 0;
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
