import { defineState } from "eve/context";
import { defineHook } from "eve/hooks";
import {
  addStepUsage,
  type TurnUsage,
  turnLimitReached,
} from "../lib/turn-limits";

const turnUsage = defineState<TurnUsage | null>(
  "fitme-coach.turn-usage",
  () => null
);

/** Cancels a turn before the model call that would exceed its caps. */
export default defineHook({
  events: {
    "step.completed"(event) {
      turnUsage.update((usage) =>
        addStepUsage(usage, event.data.turnId, event.data.usage)
      );
    },
    "step.started"(event, ctx) {
      const reached = turnLimitReached(event.data, turnUsage.get());
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
