import { defineEval } from "eve/evals";

import { OPEN_LOGGED_SET, OPEN_UNLOGGED_SET, removeSetStubs } from "./fixtures";

const QUESTION = /\?/u;

export default defineEval({
  description:
    "Removing a set from the open Workout Session: asks before a logged one, removes it on a yes, and removes an unlogged one with no question.",
  async test(t) {
    const logged = await t.session({ stubs: removeSetStubs });

    const asked = await logged.send(
      "Remove my first bench press set from today's workout only. Leave my plan alone."
    );

    asked.calledTool("get_open_workout_session");
    asked.notCalledTool("remove_set_from_workout_session");
    asked.notCalledTool("remove_set_from_exercise");
    asked.messageIncludes(QUESTION);

    const confirmed = await logged.send("Yes, remove it.");

    confirmed.calledTool("remove_set_from_workout_session", {
      count: 1,
      input: { set_id: OPEN_LOGGED_SET },
    });
    confirmed.notCalledTool("remove_set_from_exercise");

    // A fresh session, so the yes above doesn't cover this one
    const unlogged = await t.session({ stubs: removeSetStubs });

    const removed = await unlogged.send(
      "Remove my second bench press set from today's workout only. Leave my plan alone."
    );

    removed.calledTool("remove_set_from_workout_session", {
      count: 1,
      input: { set_id: OPEN_UNLOGGED_SET },
    });
    removed.notCalledTool("remove_set_from_exercise");

    t.succeeded();
  },
});
