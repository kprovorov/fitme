import { defineEval } from "eve/evals";

import { NOTE_LAST_SET, setNoteStubs } from "./fixtures";

const HEAVY = /heavy/iu;

/**
 * Asked to note that his last set was too heavy, reads the open Workout
 * Session and writes the note on the set logged most recently, with the
 * empty note he read as current_note, never on the Exercise.
 */
export default defineEval({
  description:
    "Puts a note about the last set on the set logged most recently.",
  async test(t) {
    const session = await t.session({ stubs: setNoteStubs });

    const noted = await session.send("Note that my last set was too heavy.");

    noted.calledTool("get_open_workout_session");
    noted.calledTool("set_workout_session_set_note", {
      count: 1,
      input: { current_note: "", note: HEAVY, set_id: NOTE_LAST_SET },
    });
    noted.toolOrder([
      "get_open_workout_session",
      "set_workout_session_set_note",
    ]);
    noted.notCalledTool("set_exercise_note");

    t.succeeded();
  },
});
