import { defineEval } from "eve/evals";
import { readToolStubs } from "./fixtures";

const PLAN_OR_UPPER_DAY = /Upper Lower Builder|Upper Day/i;
const LOWER_DAY = /Lower Day|squat/i;

export default defineEval({
  description: "Show my plan: reads the active Plan and names its Workouts.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });
    const turn = await session.send("What's my current workout plan?");

    t.succeeded();
    turn.calledTool("get_active_plan");
    turn.notCalledTool("display_workout_plan");
    turn.messageIncludes(PLAN_OR_UPPER_DAY);
    turn.messageIncludes(LOWER_DAY);
  },
});
