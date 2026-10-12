import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createRemoveSetFromExerciseTool({ supabase }: UserContext) {
  return tool({
    description:
      "Remove a specific set from a workout exercise. Find set IDs via get_active_plan in the 'sets' array of each exercise. Ensure the exercise has at least one set remaining after removal.",
    execute: async ({ set_id }) => {
      const { error } = await supabase
        .from("workout_exercise_sets")
        .delete()
        .eq("id", set_id);

      if (error) {
        return { error: "Failed to remove set" };
      }

      return { set_id, success: true };
    },
    inputSchema: z.object({
      set_id: z
        .string()
        .describe("The ID of the workout_exercise_sets row to delete"),
    }),
  });
}
