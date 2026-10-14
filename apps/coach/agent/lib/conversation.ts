import type { SessionContext } from "eve/tools";
import { isOwnerTurn, requireConversationOwner } from "./owner";

interface AdmitTurnDeps {
  /** Records `sessionId` as the User's; must be safe to repeat. */
  record: (userId: string, sessionId: string) => Promise<void>;
  report: (error: unknown, context: { sessionId: string }) => Promise<void>;
}

/**
 * Whether a Coach turn may run: only its Conversation owner may send one, and
 * the session id must be recorded for them first, so account deletion can
 * find every session the User has. Recording runs on every turn and is
 * idempotent, so a failed recording is retried by the next turn.
 */
export const admitTurn = async (
  {
    auth,
    sessionId,
  }: { auth: SessionContext["session"]["auth"]; sessionId: string },
  { record, report }: AdmitTurnDeps
): Promise<boolean> => {
  if (!isOwnerTurn(auth)) {
    return false;
  }
  try {
    await record(requireConversationOwner(auth), sessionId);
    return true;
  } catch (error) {
    await report(error, { sessionId });
    return false;
  }
};
