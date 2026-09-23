import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createAddSetToExerciseTool({ supabase }: SupabaseContext) {
  return tool({
    description:
      "Add a new set to an existing workout exercise. The set is appended after all current sets. Find workout_exercise_id via get_active_plan.",
    execute: async ({
      workout_exercise_id,
      reps_recommended,
      weight_recommended,
      rest_recommended,
    }) => {
      const { data: existing, error: orderError } = await supabase
        .from("workout_exercise_sets")
        .select("order")
        .eq("workout_exercise_id", workout_exercise_id)
        .order("order", { ascending: false })
        .limit(1);

      if (orderError) {
        return { error: "Failed to determine set order" };
      }

      const nextOrder =
        existing && existing.length > 0 ? existing[0].order + 1 : 1;

      const { data: newSet, error } = await supabase
        .from("workout_exercise_sets")
        .insert({
          order: nextOrder,
          reps_recommended,
          rest_recommended,
          weight_recommended,
          workout_exercise_id,
        })
        .select("id")
        .single();

      if (error) {
        return { error: "Failed to add set to exercise" };
      }

      return { order: nextOrder, set_id: newSet.id, success: true };
    },
    inputSchema: z.object({
      reps_recommended: z
        .number()
        .int()
        .min(1)
        .describe("Recommended reps for the new set"),
      rest_recommended: z
        .number()
        .int()
        .min(0)
        .describe("Recommended rest time in seconds after this set"),
      weight_recommended: z
        .number()
        .min(0)
        .describe(
          "Recommended weight for the new set in the user's unit system"
        ),
      workout_exercise_id: z
        .string()
        .describe("The ID of the workout_exercise row to add a set to"),
    }),
  });
}
