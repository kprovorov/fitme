import { asUser } from "@fitme/db";
import { removeExerciseFromWorkout } from "@fitme/services/workout-edits";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Remove an exercise from a workout. Use get_active_plan to find the workout_exercise_id (the join-table ID found as 'id' on each exercise entry in the plan, not the exercise library ID). This also removes all associated sets.",
  async execute({ workout_exercise_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const removed = await asUser(userId, (tx) =>
      removeExerciseFromWorkout(tx, userId, workout_exercise_id)
    );
    // A re-run step repeats a removal that already committed
    return removed
      ? { success: true, workout_exercise_id }
      : {
          error:
            "Workout exercise not found: it doesn't exist or was already removed",
        };
  },
  inputSchema: z.object({
    workout_exercise_id: z
      .string()
      .uuid()
      .describe(
        "The ID of the workout_exercise row to remove (the 'id' field on each exercise entry from get_active_plan)"
      ),
  }),
});
