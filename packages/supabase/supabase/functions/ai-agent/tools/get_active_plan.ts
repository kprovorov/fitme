import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createGetActivePlanTool({ supabase }: UserContext) {
  return tool({
    description:
      "Get the user's currently active workout plan with all workouts and exercises",
    execute: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          `*, workouts (
            *,
            exercises:workout_exercises (
              *,
              exercise:exercises (*),
              sets:workout_exercise_sets (*)
            )
          )`
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .single();
      if (error) {
        return { error: "No active plan found" };
      }
      return data;
    },
    inputSchema: z.object({}),
  });
}
