import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createUpdateSetRecommendationsTool({
  supabase,
}: SupabaseContext) {
  return tool({
    description:
      "Update the recommended reps, weight, or rest time on a specific set. Provide only the fields that need to change. Find set IDs via get_active_plan in the 'sets' array of each exercise.",
    execute: async ({
      set_id,
      reps_recommended,
      weight_recommended,
      rest_recommended,
    }) => {
      const updates: Record<string, number> = {};
      if (reps_recommended !== undefined) {
        updates.reps_recommended = reps_recommended;
      }
      if (weight_recommended !== undefined) {
        updates.weight_recommended = weight_recommended;
      }
      if (rest_recommended !== undefined) {
        updates.rest_recommended = rest_recommended;
      }

      const { error } = await supabase
        .from("workout_exercise_sets")
        .update(updates)
        .eq("id", set_id);

      if (error) {
        return { error: "Failed to update set recommendations" };
      }

      return { set_id, success: true, updated: updates };
    },
    inputSchema: z
      .object({
        reps_recommended: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("New recommended rep count"),
        rest_recommended: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("New recommended rest duration in seconds"),
        set_id: z
          .string()
          .describe("The ID of the workout_exercise_sets row to update"),
        weight_recommended: z
          .number()
          .min(0)
          .optional()
          .describe("New recommended weight in the user's unit system"),
      })
      .refine(
        ({ reps_recommended, weight_recommended, rest_recommended }) =>
          reps_recommended !== undefined ||
          weight_recommended !== undefined ||
          rest_recommended !== undefined,
        {
          message:
            "At least one of reps_recommended, weight_recommended, or rest_recommended must be provided",
        }
      ),
  });
}
