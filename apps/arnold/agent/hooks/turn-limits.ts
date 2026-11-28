import { reportError } from "@fitme/observability/node";
import { defineState } from "eve/context";
import { runs } from "eve/events";
import { defineHook } from "eve/hooks";

import {
  recordUsage,
  requestModelCall,
  restartAfterUserAct,
  unpricedCall,
} from "../lib/turn-limits";
import type { TurnSpend } from "../lib/turn-limits";

const turnSpend = defineState<TurnSpend | null>(
  "fitme-arnold.turn-spend",
  () => null
);

/**
 * Cancels a turn before the model call that would exceed its caps, counted
 * from the User's last act.
 */
export default defineHook({
  events: {
    // Every act of the User's consumes a delivery into the turn before its
    // next model call: the message that starts it (no spend yet, so nothing
    // changes), and an Accept, a Decline or a message sent while a call
    // waits, which continue the paused turn
    // (docs/research/arnold-tool-approval.md).
    "delivery.consumed"(event) {
      turnSpend.update((spend) =>
        restartAfterUserAct(spend, event.data.turnId)
      );
    },
    // eve records a finished call's cost after its `model.settled`, in the
    // same commit, so the view the hook gets (the whole commit) has it here.
    async "model.settled"(event, ctx) {
      const { outcome, runId } = event.data;

      if (outcome !== "completed") {
        return;
      }

      const run = runs(ctx.view).find((observed) => observed.runId === runId);
      const unpriced = unpricedCall(turnSpend.get(), runId, run?.usage);

      if (!unpriced) {
        return;
      }

      turnSpend.update(() => unpriced.spend);
      await reportError(unpriced.error, {
        runId,
        sessionId: ctx.session.id,
        turnId: unpriced.spend.turnId,
      });
    },
    "model.requested"(event, ctx) {
      const { owner, runId } = event.data;
      // A turn's own call names it; a context change's (compaction's summary)
      // is scoped to the turn it runs in, and between turns to none.
      const turnId = "turnId" in owner ? owner.turnId : event.scope?.turnId;

      if (turnId === undefined) {
        return;
      }

      const { reached, spend } = requestModelCall(turnSpend.get(), {
        runId,
        turnId,
      });

      turnSpend.update(() => spend);

      if (reached) {
        console.warn(`Arnold turn hit its ${reached} limit`, {
          sessionId: ctx.session.id,
          turnId,
        });
        ctx.cancel();
      }
    },
    // Each record is counted: summing a call's usage on `model.settled`
    // could hide one attempt's missing cost behind another's.
    async "usage.recorded"(event, ctx) {
      const { owner, usage } = event.data;

      const runId =
        owner !== undefined && "runId" in owner ? owner.runId : undefined;

      const recorded = recordUsage(
        turnSpend.get(),
        { runId, turnId: event.scope?.turnId },
        usage
      );

      turnSpend.update(() => recorded.spend);

      if (recorded.error) {
        await reportError(recorded.error, {
          runId: runId ?? "none",
          sessionId: ctx.session.id,
          turnId: recorded.spend.turnId,
        });
      }
    },
  },
});
