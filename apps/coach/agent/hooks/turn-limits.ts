import { defineState } from "eve/context";
import { defineHook } from "eve/hooks";
import { reportError } from "../lib/sentry";
import {
  addStepCost,
  missingCostError,
  type TurnSpend,
  turnLimitReached,
} from "../lib/turn-limits";

const turnSpend = defineState<TurnSpend | null>(
  "fitme-coach.turn-spend",
  () => null
);

/** Cancels a turn before the model call that would exceed its caps. */
export default defineHook({
  events: {
    async "step.completed"(event, ctx) {
      const { stepIndex, turnId, usage } = event.data;
      turnSpend.update((spend) => addStepCost(spend, turnId, usage));
      const error = missingCostError(event.data);
      if (error) {
        await reportError(error, {
          sessionId: ctx.session.id,
          stepIndex: String(stepIndex),
          turnId,
        });
      }
    },
    "step.started"(event, ctx) {
      const reached = turnLimitReached(event.data, turnSpend.get());
      if (reached) {
        console.warn(`Coach turn hit its ${reached} limit`, {
          sessionId: ctx.session.id,
          turnId: event.data.turnId,
        });
        ctx.cancel();
      }
    },
  },
});
