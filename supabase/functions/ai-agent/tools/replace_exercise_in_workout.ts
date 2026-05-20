import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createReplaceExerciseInWorkoutTool({
  supabase,
}: SupabaseContext) {
  return tool({
    description:
      "Swap one exercise for another in a workout while keeping the same number of sets and their rep/weight/rest values intact. Use search_exercises to find the new_exercise_id.",
    inputSchema: z.object({
      workout_exercise_id: z
        .string()
        .describe(
          "The ID of the workout_exercise row to replace (the 'id' field on each exercise entry from get_active_plan)"
        ),
      new_exercise_id: z
        .string()
        .describe(
          "The ID of the replacement exercise from the exercise library (from search_exercises)"
        ),
    }),
    execute: async ({ workout_exercise_id, new_exercise_id }) => {
      const { error } = await supabase
        .from("workout_exercises")
        .update({ exercise_id: new_exercise_id })
        .eq("id", workout_exercise_id);

      if (error) {
        return { error: "Failed to replace exercise" };
      }

      return { success: true, workout_exercise_id, new_exercise_id };
    },
  });
}
