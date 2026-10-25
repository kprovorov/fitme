import type { SessionContext } from "eve/tools";
import type { ClaimSession } from "./clerk-auth";
import { isEvalRunnerTurn } from "./eval-runner";
import { ownerOfTurn } from "./owner";

interface AdmitTurnDeps {
  claim: ClaimSession;
  /** Whether this is a local `eve eval` run (`isLocalEvalRun`). */
  isEvalRun: () => boolean;
  report: (error: unknown, context: { sessionId: string }) => Promise<void>;
}

/**
 * Whether an Arnold turn may run: only its Conversation owner may send one, and
 * the session id must be recorded for them first (the channel usually has
 * already), so account deletion can find every session the User has and the
 * channel keeps others out. A session recorded for anyone else, or one that
 * can't be recorded, cancels the turn; the next turn tries again.
 *
 * In a local `eve eval` run only, the eval runner's own turns run too: they
 * have no User, so there is nothing to record, and no tool can act as them.
 */
export const admitTurn = async (
  {
    auth,
    sessionId,
  }: { auth: SessionContext["session"]["auth"]; sessionId: string },
  { claim, isEvalRun, report }: AdmitTurnDeps
): Promise<boolean> => {
  if (isEvalRunnerTurn(auth)) {
    return isEvalRun();
  }
  const owner = ownerOfTurn(auth);
  if (!owner) {
    return false;
  }
  try {
    const recorded = await claim(sessionId, owner);
    if (recorded !== owner) {
      throw new Error(
        `Arnold session ${sessionId} isn't recorded for its owner`
      );
    }
    return true;
  } catch (error) {
    await report(error, { sessionId });
    return false;
  }
};
