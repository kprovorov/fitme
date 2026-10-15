import { defineEval } from "eve/evals";
import { readToolStubs } from "./fixtures";

const BENCH = /bench/i;
const SQUAT = /squat/i;
// the logged weights, not the Plan's targets (70, 100)
const LOGGED_WEIGHT = /72\.5|105/;

export default defineEval({
  description:
    "What did I do last week: reads the history and reports what was logged.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });
    const turn = await session.send(
      "What did I do in the gym last week? Today is 2026-10-14."
    );

    t.succeeded();
    turn.calledTool("get_workouts_history");
    turn.messageIncludes(BENCH);
    turn.messageIncludes(SQUAT);
    turn.messageIncludes(LOGGED_WEIGHT);
  },
});
