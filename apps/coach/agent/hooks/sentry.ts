import { defineHook } from "eve/hooks";
import { reportError } from "../lib/sentry";

interface Failure {
  readonly code: string;
  readonly message: string;
}

/** An Error for a failure event, so Sentry groups it by type and code. */
const failureError = (type: string, { code, message }: Failure): Error => {
  const error = new Error(`${type} ${code}: ${message}`);
  error.name = `Coach ${type}`;
  return error;
};

/** Every failed model step, turn and session reaches Sentry. */
export default defineHook({
  events: {
    async "session.failed"(event, ctx) {
      await reportError(failureError(event.type, event.data), {
        sessionId: ctx.session.id,
      });
    },
    async "step.failed"(event, ctx) {
      await reportError(failureError(event.type, event.data), {
        sessionId: ctx.session.id,
        stepIndex: String(event.data.stepIndex),
        turnId: event.data.turnId,
      });
    },
    async "turn.failed"(event, ctx) {
      await reportError(failureError(event.type, event.data), {
        sessionId: ctx.session.id,
        turnId: event.data.turnId,
      });
    },
  },
});
