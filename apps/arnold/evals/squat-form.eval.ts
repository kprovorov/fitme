import { defineEval } from "eve/evals";

import { readToolStubs } from "./fixtures";

const A_COMMON_MISTAKE = /knee|heel|back/iu;

export default defineEval({
  description:
    "A form question reads the Exercise's guide from the library and answers from it, with no plan card.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });

    const turn = await session.send("How do I do a back squat with good form?");

    t.succeeded();
    turn.calledTool("get_exercise_guide");
    turn.notCalledTool("display_workout_plan");
    turn.messageIncludes(A_COMMON_MISTAKE);
  },
});
