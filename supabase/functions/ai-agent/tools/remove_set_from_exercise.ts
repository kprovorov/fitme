import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createRemoveSetFromExerciseTool({ supabase }: SupabaseContext) {
  return tool({
    description:
      "Remove a specific set from a workout exercise. Find set IDs via get_active_plan in the 'sets' array of each exercise. Ensure the exercise has at least one set remaining after removal.",
    inputSchema: z.object({
      set_id: z
        .string()
        .describe("The ID of the workout_exercise_sets row to delete"),
    }),
    execute: async ({ set_id }) => {
      const { error } = await supabase
        .from("workout_exercise_sets")
        .delete()
        .eq("id", set_id);

      if (error) {
        return { error: "Failed to remove set" };
      }

      return { success: true, set_id };
    },
  });
}
