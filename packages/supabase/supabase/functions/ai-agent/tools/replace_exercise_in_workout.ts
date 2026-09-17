import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

const setSchema = z.object({
  reps_recommended: z
    .number()
    .int()
    .min(1)
    .describe("Number of reps recommended for this set"),
  rest_recommended: z
    .number()
    .int()
    .min(0)
    .describe("Rest time in seconds after this set"),
  weight_recommended: z
    .number()
    .min(0)
    .describe("Recommended weight in the user's unit system"),
});

export function createReplaceExerciseInWorkoutTool({
  supabase,
}: SupabaseContext) {
  return tool({
    description:
      "Swap one exercise for another in a workout and replace its sets with new rep/weight/rest recommendations suited to the new exercise. Use search_exercises to find the new_exercise_id.",
    execute: async ({ workout_exercise_id, new_exercise_id, sets }) => {
      const { error: weError } = await supabase
        .from("workout_exercises")
        .update({ exercise_id: new_exercise_id })
        .eq("id", workout_exercise_id);

      if (weError) {
        return { error: "Failed to replace exercise" };
      }

      const { error: deleteError } = await supabase
        .from("workout_exercise_sets")
        .delete()
        .eq("workout_exercise_id", workout_exercise_id);

      if (deleteError) {
        return { error: "Exercise replaced but failed to remove old sets" };
      }

      const setsToInsert = sets.map((s, i) => ({
        order: i + 1,
        reps_recommended: s.reps_recommended,
        rest_recommended: s.rest_recommended,
        weight_recommended: s.weight_recommended,
        workout_exercise_id,
      }));

      const { error: insertError } = await supabase
        .from("workout_exercise_sets")
        .insert(setsToInsert);

      if (insertError) {
        return { error: "Exercise replaced but failed to insert new sets" };
      }

      return {
        new_exercise_id,
        sets_replaced: sets.length,
        success: true,
        workout_exercise_id,
      };
    },
    inputSchema: z.object({
      new_exercise_id: z
        .string()
        .describe(
          "The ID of the replacement exercise from the exercise library (from search_exercises)"
        ),
      sets: z
        .array(setSchema)
        .min(1)
        .describe(
          "New sets configuration suited to the replacement exercise. Replaces all existing sets."
        ),
      workout_exercise_id: z
        .string()
        .describe(
          "The ID of the workout_exercise row to replace (the 'id' field on each exercise entry from get_active_plan)"
        ),
    }),
  });
}
