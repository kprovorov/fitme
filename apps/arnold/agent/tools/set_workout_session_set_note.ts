import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { cleanNote } from "@fitme/core/notes";
import type { NoteRefusal } from "@fitme/core/notes";
import { asUser } from "@fitme/db";
import { setWorkoutSessionSetNote } from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";

const NOTHING_SAVED = "nothing was saved";

const refusals: Record<NoteRefusal, string> = {
  nul: `The note holds a NUL character, which a note can't contain; ${NOTHING_SAVED}.`,
  too_long: `The note is over ${MAX_NOTE_LENGTH} characters; ${NOTHING_SAVED}. Don't shorten it yourself: tell the user it doesn't fit and ask what to cut.`,
};

export default defineTool({
  description: `Write, change or clear the user's note on one logged set of a workout session (the open one, or a finished one), only when the user explicitly asks you to. Find the set's id with get_open_workout_session, or get_workouts_history for a finished workout. Send the whole resulting note (at most ${MAX_NOTE_LENGTH} characters; empty clears it) and current_note, the set's note exactly as that tool showed it (empty when it had none). Adding to a note keeps the user's existing words; replace or clear it only when they say so. Show the user the resulting note afterwards. This only writes a note: it never logs or changes a set's reps or weight.`,
  async execute({ current_note, note, set_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const cleaned = cleanNote(note);

    if (!cleaned.ok) {
      return { error: refusals[cleaned.reason] };
    }

    const result = await asUser(
      userId,
      async (tx) =>
        await setWorkoutSessionSetNote(tx, userId, {
          expectedNote: current_note,
          note,
          setId: set_id,
        })
    );

    switch (result.status) {
      case "invalid": {
        return { error: refusals[result.reason] };
      }

      case "conflict": {
        return {
          current_note: result.note ?? "",
          error: `The set's note changed since you read it; ${NOTHING_SAVED}. current_note is the note as it is now: show it to the user and ask how to change it.`,
        };
      }

      case "not_logged": {
        return {
          error: `That set isn't logged yet, so it can't have a note; ${NOTHING_SAVED}. Tell the user it isn't logged yet: they can log it on the workout screen, then ask again.`,
        };
      }

      case "not_found": {
        return {
          error: `Set not found: it doesn't exist or was removed; ${NOTHING_SAVED}.`,
        };
      }

      case "saved": {
        // Saved, also when a re-run step repeats a write that already landed
        return { note: result.set.note ?? "", success: true };
      }
    }
  },
  inputSchema: z.object({
    current_note: z
      .string()
      .describe(
        "The set's note exactly as get_open_workout_session or get_workouts_history showed it, or empty when it had none"
      ),
    note: z
      .string()
      .describe(
        "The whole note as it should read afterwards, the user's existing words included; empty clears it"
      ),
    set_id: z
      .guid()
      .describe(
        "The id of the logged set, from get_open_workout_session or get_workouts_history"
      ),
  }),
});
