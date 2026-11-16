import { reportError } from "@fitme/observability/node";
import type { ErrorInfo } from "eve/events";
import { defineHook } from "eve/hooks";

/** A failed item's error as eve records it; it may name none. */
type Failure = Pick<ErrorInfo, "code" | "message"> | undefined;

/** An Error for a failure event, so Sentry groups it by type and code. */
const failureError = (type: string, failure: Failure): Error => {
  const code = failure?.code ?? "unknown";
  const message = failure?.message ?? "no error recorded";
  const error = new Error(`${type} failed ${code}: ${message}`);
  error.name = `Arnold ${type} failed`;

  return error;
};

/**
 * Every failed model call, turn and session is reported. Each ends with one
 * event whose `outcome` says how; only `failed` is a failure (a cancelled
 * turn, or a model call a cancel interrupted, isn't).
 */
export default defineHook({
  events: {
    async "model.settled"(event, ctx) {
      if (event.data.outcome !== "failed") {
        return;
      }

      const { runId } = event.data;
      const sessionId = ctx.session.id;
      // A turn's model call names its turn; a context change's doesn't.
      const turnId = event.scope?.turnId;

      await reportError(
        failureError(event.type, event.data.error),
        turnId === undefined
          ? { runId, sessionId }
          : { runId, sessionId, turnId }
      );
    },
    async "session.ended"(event, ctx) {
      if (event.data.outcome !== "failed") {
        return;
      }

      await reportError(failureError(event.type, event.data.error), {
        sessionId: ctx.session.id,
      });
    },
    async "turn.settled"(event, ctx) {
      if (event.data.outcome !== "failed") {
        return;
      }

      await reportError(failureError(event.type, event.data.error), {
        sessionId: ctx.session.id,
        turnId: event.data.turnId,
      });
    },
  },
});
