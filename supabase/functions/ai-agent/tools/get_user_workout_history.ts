import { tool } from "npm:ai";
import { z } from "npm:zod";
import { ToolContext } from "./types.ts";

export function createGetUserWorkoutHistoryTool({
  supabaseClient,
  log,
}: ToolContext) {
  return tool({
    description:
      "Get the user's completed workout history with exercises and logged sets (reps and weight). Returns the most recent sessions first.",
    inputSchema: z.object({
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe(
          "How many days back to fetch workout history (default 30, max 365)",
        ),
    }),
    execute: async ({ days }) => {
      const since = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();
      log("tool_call", { tool: "get_user_workout_history", days, since });
      const { data, error } = await supabaseClient
        .from("workout_sessions")
        .select(
          `
          id,
          started_at,
          finished_at,
          workout:workouts (
            id,
            name,
            plan:plans (id, name)
          ),
          exercises:workout_session_exercises (
            id,
            order,
            exercise:exercises (id, name, muscle_groups),
            sets:workout_session_exercise_sets (
              order,
              reps_recommended,
              weight_recommended,
              reps_completed,
              weight_completed,
              logged_at
            )
          )
        `,
        )
        .not("finished_at", "is", null)
        .gte("finished_at", since)
        .order("finished_at", { ascending: false });

      if (error) {
        log("tool_error", {
          tool: "get_user_workout_history",
          error: error.message,
        });
        return { error: "Failed to fetch workout history" };
      }

      log("tool_ok", {
        tool: "get_user_workout_history",
        sessionCount: data?.length ?? 0,
        days,
      });
      return { sessions: data ?? [], days };
    },
  });
}
