import { reportError } from "@fitme/observability/node";
import { defineState } from "eve/context";
import { runs } from "eve/events";
import { defineHook } from "eve/hooks";

import {
  addCallCost,
  requestModelCall,
  unpricedCall,
} from "../lib/turn-limits";
import type { TurnSpend } from "../lib/turn-limits";

const turnSpend = defineState<TurnSpend | null>(
  "fitme-arnold.turn-spend",
  () => null
);

/** Cancels a turn before the model call that would exceed its caps. */
export default defineHook({
  events: {
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

      // A context change's call (compaction's summary) belongs to no turn.
      if (!("turnId" in owner)) {
        return;
      }

      const { reached, spend } = requestModelCall(turnSpend.get(), {
        runId,
        turnId: owner.turnId,
      });

      turnSpend.update(() => spend);

      if (reached) {
        console.warn(`Arnold turn hit its ${reached} limit`, {
          sessionId: ctx.session.id,
          turnId: owner.turnId,
        });
        ctx.cancel();
      }
    },
    "usage.recorded"(event) {
      const { owner, usage } = event.data;

      if (owner === undefined || !("runId" in owner)) {
        return;
      }

      turnSpend.update((spend) => addCallCost(spend, owner.runId, usage));
    },
  },
});
