import { defineEval } from "eve/evals";

import { setNoteStubs } from "./fixtures";

/**
 * Writes no set note when the User only says a set was heavy: only an
 * explicit ask ("note that…") writes one.
 */
export default defineEval({
  description: "Writes no set note when the User only says a set was heavy.",
  async test(t) {
    const session = await t.session({ stubs: setNoteStubs });

    const mentioned = await session.send(
      "My last set was heavy. Should I drop the weight for the next one?"
    );

    mentioned.notCalledTool("set_workout_session_set_note");
    mentioned.notCalledTool("set_exercise_note");

    t.succeeded();
  },
});
