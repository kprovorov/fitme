import type { SessionContext } from "eve/tools";
import type { ClaimSession } from "./clerk-auth";
import { ownerOfTurn } from "./owner";

interface AdmitTurnDeps {
  claim: ClaimSession;
  report: (error: unknown, context: { sessionId: string }) => Promise<void>;
}

/**
 * Whether a Coach turn may run: only its Conversation owner may send one, and
 * the session id must be recorded for them first (the channel usually has
 * already), so account deletion can find every session the User has and the
 * channel keeps others out. A session recorded for anyone else, or one that
 * can't be recorded, cancels the turn; the next turn tries again.
 */
export const admitTurn = async (
  {
    auth,
    sessionId,
  }: { auth: SessionContext["session"]["auth"]; sessionId: string },
  { claim, report }: AdmitTurnDeps
): Promise<boolean> => {
  const owner = ownerOfTurn(auth);
  if (!owner) {
    return false;
  }
  try {
    const recorded = await claim(sessionId, owner);
    if (recorded !== owner) {
      throw new Error(
        `Coach session ${sessionId} isn't recorded for its owner`
      );
    }
    return true;
  } catch (error) {
    await report(error, { sessionId });
    return false;
  }
};
