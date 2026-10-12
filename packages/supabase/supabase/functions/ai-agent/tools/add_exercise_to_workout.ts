import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

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

export function createAddExerciseToWorkoutTool({ supabase }: UserContext) {
  return tool({
    description:
      "Add an exercise to a specific workout in the user's plan. Use search_exercises first to find a valid exercise_id. Provide initial sets with rep, weight, and rest recommendations.",
    execute: async ({ workout_id, exercise_id, sets }) => {
      const { data: existing, error: orderError } = await supabase
        .from("workout_exercises")
        .select("order")
        .eq("workout_id", workout_id)
        .order("order", { ascending: false })
        .limit(1);

      if (orderError) {
        return { error: "Failed to determine exercise order" };
      }

      const nextOrder =
        existing && existing.length > 0 ? existing[0].order + 1 : 1;

      const { data: weRow, error: weError } = await supabase
        .from("workout_exercises")
        .insert({ exercise_id, order: nextOrder, workout_id })
        .select("id")
        .single();

      if (weError) {
        return { error: "Failed to add exercise to workout" };
      }

      const setsToInsert = sets.map((s, i) => ({
        order: i + 1,
        reps_recommended: s.reps_recommended,
        rest_recommended: s.rest_recommended,
        weight_recommended: s.weight_recommended,
        workout_exercise_id: weRow.id,
      }));

      const { error: setsError } = await supabase
        .from("workout_exercise_sets")
        .insert(setsToInsert);

      if (setsError) {
        return { error: "Exercise added but failed to insert sets" };
      }

      return {
        sets_added: sets.length,
        success: true,
        workout_exercise_id: weRow.id,
      };
    },
    inputSchema: z.object({
      exercise_id: z
        .string()
        .describe("The ID of the exercise to add (from search_exercises)"),
      sets: z
        .array(setSchema)
        .min(1)
        .describe("Initial sets configuration for this exercise"),
      workout_id: z
        .string()
        .describe("The ID of the workout to add the exercise to"),
    }),
  });
}
