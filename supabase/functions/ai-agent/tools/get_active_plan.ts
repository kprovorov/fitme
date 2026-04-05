import { tool } from "npm:ai";
import { z } from "npm:zod";
import { ToolContext } from "./types.ts";

export function createGetActivePlanTool({ supabaseClient, log }: ToolContext) {
  return tool({
    description:
      "Get the user's currently active workout plan with all workouts and exercises",
    inputSchema: z.object({}),
    execute: async () => {
      log("tool_call", { tool: "get_active_plan" });
      const { data, error } = await supabaseClient
        .from("plans")
        .select(
          `*, workouts (
            *,
            exercises:workout_exercises (
              *,
              exercise:exercises (*),
              sets:workout_exercise_sets (*)
            )
          )`,
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .single();
      if (error) {
        log("tool_error", { tool: "get_active_plan", error: error.message });
        return { error: "No active plan found" };
      }
      log("tool_ok", { tool: "get_active_plan", planId: data?.id });
      return data;
    },
  });
}
