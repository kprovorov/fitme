import { defineEval } from "eve/evals";

import { exerciseNote, noteStubs, SQUAT } from "./fixtures";

const EXISTING = "Feet shoulder-width, toes out a bit.";
const SAFETY = /safety/iu;

/** The note it writes: the User's existing words kept, then the safety bars on 4. */
const APPENDED =
  /^(?=[\s\S]*Feet shoulder-width, toes out a bit\.)(?=[\s\S]*safety)(?=[\s\S]*\b4\b)/iu;

/**
 * Asked to note something on an Exercise that already has a note, adds to it,
 * keeping the User's words, sends the note he read as current_note, and shows
 * the resulting note.
 */
export default defineEval({
  description:
    "Adds to an existing Exercise note instead of replacing it, and shows the result.",
  async test(t) {
    const session = await t.session({
      stubs: noteStubs([exerciseNote(SQUAT, "Back Squat", EXISTING)]),
    });

    const added = await session.send(
      "Note that I set the safety bars on hole 4 for back squats."
    );

    added.calledTool("list_exercise_notes");
    added.calledTool("set_exercise_note", {
      count: 1,
      input: {
        current_note: EXISTING,
        exercise_slug: SQUAT,
        note: APPENDED,
      },
    });
    added.toolOrder(["list_exercise_notes", "set_exercise_note"]);
    // The resulting note, old words and new
    added.messageIncludes(EXISTING);
    added.messageIncludes(SAFETY);

    t.succeeded();
  },
});
