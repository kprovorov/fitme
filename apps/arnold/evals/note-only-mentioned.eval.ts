import { defineEval } from "eve/evals";

import { exerciseNote, noteStubs, SQUAT } from "./fixtures";

/**
 * Writes no note for something the User only mentions: only an explicit ask
 * ("note that…") writes one.
 */
export default defineEval({
  description:
    "Writes no note when the User only mentions something useful about an exercise.",
  async test(t) {
    const session = await t.session({
      stubs: noteStubs([
        exerciseNote(
          SQUAT,
          "Back Squat",
          "Feet shoulder-width, toes out a bit."
        ),
      ]),
    });

    const mentioned = await session.send(
      "My left knee felt a bit off on squats yesterday, and I use the safety bars on hole 4. How should I warm up for squats today?"
    );

    mentioned.notCalledTool("set_exercise_note");

    const again = await session.send(
      "Thanks. By the way, I find squats easier with my heels on small plates."
    );

    again.notCalledTool("set_exercise_note");

    t.succeeded();
  },
});
