import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { cleanNote } from "@fitme/core/notes";
import type { NoteRefusal } from "@fitme/core/notes";
import { asUser } from "@fitme/db";
import { setExerciseNote } from "@fitme/services/exercise-notes";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { checkExerciseSlugs, exerciseSlugSchema } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

const NOTHING_SAVED = "nothing was saved";

const refusals: Record<NoteRefusal, string> = {
  nul: `The note holds a NUL character, which a note can't contain; ${NOTHING_SAVED}.`,
  too_long: `The note is over ${MAX_NOTE_LENGTH} characters; ${NOTHING_SAVED}. Don't shorten it yourself: tell the user it doesn't fit and ask what to cut.`,
};

export default defineTool({
  description: `Write, change or clear the user's note on an exercise, only when the user explicitly asks you to. Send the whole resulting note (at most ${MAX_NOTE_LENGTH} characters; empty clears it) and current_note, the note exactly as list_exercise_notes showed it (empty when there was none). Adding to a note keeps the user's existing words; replace or clear it only when they say so. Show the user the resulting note afterwards.`,
  async execute({ current_note, exercise_slug, note }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const cleaned = cleanNote(note);

    if (!cleaned.ok) {
      return { error: refusals[cleaned.reason] };
    }

    // Writing a note checks its Exercise; clearing needs none, so a note on an
    // Exercise that left the Library can always be cleared. The slug is kept
    // as sent, an old one included, as list_exercise_notes shows it, so a
    // note is always read, written and cleared under the same slug
    if (cleaned.note !== null) {
      const refused = await checkExerciseSlugs([exercise_slug]);

      if (refused) {
        return refused;
      }
    }

    const result = await asUser(
      userId,
      async (tx) =>
        await setExerciseNote(tx, userId, {
          exerciseSlug: exercise_slug,
          expectedNote: current_note,
          note,
        })
    );

    if (result.status === "invalid") {
      return { error: refusals[result.reason] };
    }

    if (result.status === "conflict") {
      return {
        current_note: result.note?.note ?? "",
        error: `The note changed since you read it; ${NOTHING_SAVED}. current_note is the note as it is now: show it to the user and ask how to change it.`,
      };
    }

    // Also when a re-run step repeats a write that already landed
    return {
      exercise_slug,
      note: result.note?.note ?? "",
      success: true,
    };
  },
  inputSchema: z.object({
    current_note: z
      .string()
      .describe(
        "The note exactly as list_exercise_notes showed it, or empty when the exercise had none"
      ),
    exercise_slug: exerciseSlugSchema.describe(
      "The exercise_slug of the exercise (from list_exercise_notes, search_exercises, the plan or a workout)"
    ),
    note: z
      .string()
      .describe(
        "The whole note as it should read afterwards, the user's existing words included; empty clears it"
      ),
  }),
});
