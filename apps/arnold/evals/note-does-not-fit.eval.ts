import { defineEval } from "eve/evals";

import { exerciseNote, noteStubs, SQUAT } from "./fixtures";

const QUESTION = /\?/u;

/** 493 characters of the User's own words: the addition can't fit in 500. */
const LONG_NOTE = [
  "Feet shoulder-width, toes out about 15 degrees, weight over mid-foot.",
  "Bar high on the traps, hands just outside the shoulders, elbows under the bar.",
  "Big breath into the belly before every rep and hold it until I'm back up.",
  "Knees track over the toes, don't let them cave in on the way up.",
  "Hit depth: hip crease just below the knee, check the side mirror on set one.",
  "Safety bars on hole 4. Warm up with the empty bar, then 60, 80, 100.",
  "If the left knee feels off, swap to box squats for the day.",
].join("\n");

/**
 * Asked to add to a note that would then be over 500 characters, writes
 * nothing, says it doesn't fit and asks what to cut, never shortening it
 * himself.
 */
export default defineEval({
  description:
    "Writes nothing when the resulting note won't fit, and asks the User what to cut.",
  async test(t) {
    const session = await t.session({
      stubs: noteStubs([exerciseNote(SQUAT, "Back Squat", LONG_NOTE)]),
    });

    const asked = await session.send(
      "Add to my back squat note: keep my chest up out of the hole, drive my upper back into the bar, and pause for one second at the bottom on the last set of every session."
    );

    asked.calledTool("list_exercise_notes");
    asked.notCalledTool("set_exercise_note");
    asked.messageIncludes(QUESTION);

    t.succeeded();
  },
});
