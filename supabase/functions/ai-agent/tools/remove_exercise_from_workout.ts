import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createRemoveExerciseFromWorkoutTool({
  supabase,
}: SupabaseContext) {
  return tool({
    description:
      "Remove an exercise from a workout. Use get_active_plan to find the workout_exercise_id (the join-table ID found as 'id' on each exercise entry in the plan, not the exercise library ID). This also removes all associated sets.",
    inputSchema: z.object({
      workout_exercise_id: z
        .string()
        .describe(
          "The ID of the workout_exercise row to remove (the 'id' field on each exercise entry from get_active_plan)"
        ),
    }),
    execute: async ({ workout_exercise_id }) => {
      const { error: setsError } = await supabase
        .from("workout_exercise_sets")
        .delete()
        .eq("workout_exercise_id", workout_exercise_id);

      if (setsError) {
        return { error: "Failed to remove exercise sets" };
      }

      const { error: weError } = await supabase
        .from("workout_exercises")
        .delete()
        .eq("id", workout_exercise_id);

      if (weError) {
        return { error: "Failed to remove exercise from workout" };
      }

      return { success: true, workout_exercise_id };
    },
  });
}
