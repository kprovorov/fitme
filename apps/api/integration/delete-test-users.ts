import { type Transaction, withService } from "@fitme/db";
import {
  deleteUserData,
  USER_DATA_TABLES,
} from "@fitme/services/delete-user-data";
import { sql } from "drizzle-orm";

const MAX_ATTEMPTS = 300;
const BACKOFF_MS = 25;

/** SQLSTATE 55P03 (lock_not_available): a NOWAIT lock was taken. */
const LOCK_NOT_AVAILABLE = "55P03";

/** Whether `error` (or an error in its cause chain) is a refused NOWAIT lock. */
const isLockNotAvailable = (error: unknown): boolean => {
  let current: unknown = error;
  while (current instanceof Error) {
    if ("code" in current && current.code === LOCK_NOT_AVAILABLE) {
      return true;
    }
    current = current.cause;
  }
  return false;
};

/**
 * Runs `fn` in a service transaction holding every User table in share row
 * exclusive mode, as deleteUserData's first step does, but taken NOWAIT and
 * retried in a new transaction until no other transaction holds one.
 *
 * Integration files run in parallel, and a fixture writing the User tables
 * out of deleteUserData's order would deadlock with a transaction waiting
 * for those locks one table at a time (it holding the earlier tables, the
 * fixture holding a later one and asking for an earlier one). A transaction
 * that never waits for them can't be part of that cycle.
 */
export const withUserTablesLocked = async <T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: retries one at a time
      return await withService(async (tx) => {
        await tx.execute(
          sql`lock table ${sql.join(USER_DATA_TABLES, sql`, `)} in share row exclusive mode nowait`
        );
        return fn(tx);
      });
    } catch (error) {
      if (!isLockNotAvailable(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
    }
    await new Promise((resolve) =>
      setTimeout(resolve, BACKOFF_MS * (1 + Math.random()))
    );
  }
};

/**
 * Deletes the test Users' rows through deleteUserData, in one transaction
 * that already holds its locks, so its own lock statement never waits.
 */
export const deleteTestUsers = (userIds: string[]): Promise<void> =>
  withUserTablesLocked(async (tx) => {
    for (const userId of userIds) {
      // biome-ignore lint/performance/noAwaitInLoops: one statement at a time on tx
      await deleteUserData(tx, userId);
    }
  });
