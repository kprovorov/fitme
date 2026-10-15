import { defineHook } from "eve/hooks";
import { claimSession } from "../lib/claim-session";
import { admitTurn } from "../lib/conversation";
import { isLocalEvalRun } from "../lib/eval-runner";
import { reportError } from "../lib/sentry";

/**
 * Before each turn: only the Conversation's owner may run one, and the session
 * id must be recorded for them (as the User, under RLS). Anything else cancels
 * the turn before the model runs.
 */
export default defineHook({
  events: {
    async "turn.started"(_event, ctx) {
      const admitted = await admitTurn(
        { auth: ctx.session.auth, sessionId: ctx.session.id },
        { claim: claimSession, isEvalRun: isLocalEvalRun, report: reportError }
      );
      if (!admitted) {
        ctx.cancel();
      }
    },
  },
});
