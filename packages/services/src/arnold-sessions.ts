import { arnoldSessions, type Transaction } from "@fitme/db";
import { eq } from "drizzle-orm";

/**
 * Records that Arnold's EVE session `sessionId` belongs to the User, in
 * `tx` (from `asUser`). EVE can't list a User's sessions, so account deletion
 * resets the ones recorded here. Safe to repeat: a session id is recorded
 * once, and an id already recorded for anyone is left alone.
 */
export const recordArnoldSession = async (
  tx: Transaction,
  userId: string,
  sessionId: string
): Promise<void> => {
  await tx
    .insert(arnoldSessions)
    .values({ sessionId, userId })
    .onConflictDoNothing({ target: arnoldSessions.sessionId });
};

/**
 * The User an Arnold session id was recorded for, or `null` when it wasn't
 * (yet), in `tx` (from `withService`: the point is to see whose it is when
 * it isn't the caller's). Arnold's channel uses it to refuse every session
 * route to anyone but the owner.
 */
export const getArnoldSessionOwner = async (
  tx: Transaction,
  sessionId: string
): Promise<string | null> => {
  const [row] = await tx
    .select({ userId: arnoldSessions.userId })
    .from(arnoldSessions)
    .where(eq(arnoldSessions.sessionId, sessionId));
  return row?.userId ?? null;
};

/**
 * The User's recorded Arnold session ids, in `tx` (from `asUser`, or
 * `withService` for a deleted User, whose retired id RLS no longer matches).
 */
export const listArnoldSessionIds = async (
  tx: Transaction,
  userId: string
): Promise<string[]> => {
  const rows = await tx
    .select({ sessionId: arnoldSessions.sessionId })
    .from(arnoldSessions)
    .where(eq(arnoldSessions.userId, userId));
  return rows.map((row) => row.sessionId);
};
