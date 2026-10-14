import { coachSessions, type Transaction } from "@fitme/db";
import { eq } from "drizzle-orm";

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

/** The User's recorded Coach session ids, in `tx` (from `asUser`). */
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
