import { defineEval } from "eve/evals";

import { OPEN_UNLOGGED_SET, removeSetStubs } from "./fixtures";

const TODAY_OR_PLAN = /today[\s\S]*plan[\s\S]*\?/iu;

export default defineEval({
  description:
    'An unclear set removal with the Exercise in the open Workout Session: asks "just today, or your Plan too?" before removing anything.',
  async test(t) {
    const session = await t.session({ stubs: removeSetStubs });

    const asked = await session.send("Remove the last bench press set.");

    asked.calledTool("get_open_workout_session");
    asked.notCalledTool("remove_set_from_workout_session");
    asked.notCalledTool("remove_set_from_exercise");
    asked.messageIncludes(TODAY_OR_PLAN);

    const today = await session.send("Just today.");

    today.calledTool("remove_set_from_workout_session", {
      count: 1,
      input: { set_id: OPEN_UNLOGGED_SET },
    });
    today.notCalledTool("remove_set_from_exercise");

    t.succeeded();
  },
});
