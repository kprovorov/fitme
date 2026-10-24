import { asUser, withService } from "@fitme/db";
import {
  getCoachSessionOwner,
  recordCoachSession,
} from "@fitme/services/coach-sessions";
import type { ClaimSession } from "./clerk-auth";

/**
 * Records the session for the User (as them, under RLS; a no-op when it is
 * recorded already, for anyone), then reads whose it is (`withService`: when
 * it isn't theirs, RLS would hide the row).
 */
export const claimSession: ClaimSession = async (sessionId, userId) => {
  await asUser(userId, (tx) => recordCoachSession(tx, userId, sessionId));
  return await withService((tx) => getCoachSessionOwner(tx, sessionId));
};
