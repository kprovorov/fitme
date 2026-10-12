import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createGetWorkoutsHistoryTool({ supabase }: UserContext) {
  return tool({
    description:
      "Get the user's recent completed workout sessions with exercises and actual sets performed. Use this to analyze progress, spot patterns, or give personalized advice.",
    execute: async ({ limit }) => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select(
          `*,
          workout:workouts (
            *,
            plan:plans (*)
          ),
          exercises:workout_session_exercises (
            *,
            exercise:exercises (*),
            sets:workout_session_exercise_sets (*)
          )`
        )
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(limit);

      if (error) {
        return { error: "Failed to fetch workout history" };
      }

      return data ?? [];
    },
    inputSchema: z.object({
      limit: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("Number of recent sessions to fetch (default 10, max 20)"),
    }),
  });
}
