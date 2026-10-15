import { defineEval } from "eve/evals";
import { readToolStubs } from "./fixtures";

const MINUTES = /minute/i;

export default defineEval({
  description: "A general fitness question gets a text answer, no plan card.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });
    const turn = await session.send(
      "How long should I rest between sets when training for strength?"
    );

    t.succeeded();
    turn.notCalledTool("display_workout_plan");
    turn.messageIncludes(MINUTES);
  },
});
