import { defineEval } from "eve/evals";

import { setNoteStubs } from "./fixtures";

const NOT_LOGGED = /(?:not|n't|yet to be) (?:been )?logged|log it/iu;

/**
 * Asked for a note on a set not logged yet, writes none and says the set
 * isn't logged yet: only a logged set can have a note.
 */
export default defineEval({
  description:
    "Writes no note on a set that isn't logged yet, and says it isn't logged.",
  async test(t) {
    const session = await t.session({ stubs: setNoteStubs });

    const asked = await session.send(
      "Note on my third bench set that I want a spotter."
    );

    asked.calledTool("get_open_workout_session");
    asked.notCalledTool("set_workout_session_set_note");
    asked.notCalledTool("set_exercise_note");
    asked.messageIncludes(NOT_LOGGED);

    t.succeeded();
  },
});
