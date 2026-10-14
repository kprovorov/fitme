import { asUser } from "@fitme/db";
import { recordCoachSession } from "@fitme/services/coach-sessions";
import { defineHook } from "eve/hooks";
import { admitTurn } from "../lib/conversation";
import { reportError } from "../lib/sentry";

/**
 * Before each turn: only the Conversation's owner may run one, and the session
 * id is recorded for them (as the User, under RLS). Anything else cancels the
 * turn before the model runs.
 */
export default defineHook({
  events: {
    async "turn.started"(_event, ctx) {
      const admitted = await admitTurn(
        { auth: ctx.session.auth, sessionId: ctx.session.id },
        {
          record: (userId, sessionId) =>
            asUser(userId, (tx) => recordCoachSession(tx, userId, sessionId)),
          report: reportError,
        }
      );
      if (!admitted) {
        ctx.cancel();
      }
    },
  },
});
