import { asUser } from "@fitme/db";
import { removeSetFromExercise } from "@fitme/services/workout-edits";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Remove a specific set from a workout exercise. Find set IDs via get_active_plan in the 'sets' array of each exercise. Ensure the exercise has at least one set remaining after removal.",
  async execute({ set_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const removed = await asUser(userId, (tx) =>
      removeSetFromExercise(tx, userId, set_id)
    );
    // A re-run step repeats a removal that already committed
    return removed
      ? { set_id, success: true }
      : { error: "Set not found: it doesn't exist or was already removed" };
  },
  inputSchema: z.object({
    set_id: z
      .guid()
      .describe("The ID of the workout_exercise_sets row to delete"),
  }),
});
