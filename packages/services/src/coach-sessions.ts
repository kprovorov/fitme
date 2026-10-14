import { coachSessions, type Transaction } from "@fitme/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Records that the Coach's EVE session `sessionId` belongs to the User, in
 * `tx` (from `asUser`). EVE can't list a User's sessions, so account deletion
 * resets the ones recorded here. Safe to repeat: a session id is recorded
 * once, and an id already recorded for anyone is left alone.
 */
export const recordCoachSession = async (
  tx: Transaction,
  userId: string,
  sessionId: string
): Promise<void> => {
  await tx
    .insert(coachSessions)
    .values({ sessionId, userId })
    .onConflictDoNothing({ target: coachSessions.sessionId });
};

/**
 * The User a Coach session id was recorded for, or `null` when it wasn't
 * (yet), in `tx` (from `withService`: the point is to see whose it is when
 * it isn't the caller's). The Coach channel uses it to refuse every session
 * route to anyone but the owner.
 */
export const getCoachSessionOwner = async (
  tx: Transaction,
  sessionId: string
): Promise<string | null> => {
  const [row] = await tx
    .select({ userId: coachSessions.userId })
    .from(coachSessions)
    .where(eq(coachSessions.sessionId, sessionId));
  return row?.userId ?? null;
};

/**
 * The User's recorded Coach session ids, in `tx` (from `asUser`, or
 * `withService` for a deleted User, whose retired id RLS no longer matches).
 */
export const listCoachSessionIds = async (
  tx: Transaction,
  userId: string
): Promise<string[]> => {
  const rows = await tx
    .select({ sessionId: coachSessions.sessionId })
    .from(coachSessions)
    .where(eq(coachSessions.userId, userId));
  return rows.map((row) => row.sessionId);
};

/**
 * Deletes the User's records of the given Coach sessions, in `tx` (from
 * `withService`: only service_role may delete). Account deletion calls it
 * once those EVE sessions are reset: each row is the ACL for its session, so
 * deleting it while the session is live would open that session to anyone.
 * Ids recorded for another User are left alone.
 */
export const deleteCoachSessions = async (
  tx: Transaction,
  userId: string,
  sessionIds: readonly string[]
): Promise<void> => {
  if (sessionIds.length === 0) {
    return;
  }
  await tx
    .delete(coachSessions)
    .where(
      and(
        eq(coachSessions.userId, userId),
        inArray(coachSessions.sessionId, [...sessionIds])
      )
    );
};
