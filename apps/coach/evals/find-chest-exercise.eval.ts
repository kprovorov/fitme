import { defineEval } from "eve/evals";
import { readToolStubs } from "./fixtures";

const A_CHEST_EXERCISE = /Bench Press|Incline Dumbbell Press/;

export default defineEval({
  description:
    "Find a chest exercise: searches the library and suggests what it found.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });
    const turn = await session.send("Find me a good chest exercise.");

    t.succeeded();
    turn.calledTool("search_exercises");
    turn.notCalledTool("display_workout_plan");
    turn.messageIncludes(A_CHEST_EXERCISE);
  },
});
