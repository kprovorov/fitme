import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { ToolContext } from "./types.ts";

const WorkoutExerciseSetInputSchema = z.object({
  order: z.number(),
  weight_recommended: z.number(),
  reps_recommended: z.number(),
  rest_recommended: z.number(),
});

const WorkoutExerciseInputSchema = z.object({
  exercise_id: z.string().uuid(),
  order: z.number(),
  sets: z.array(WorkoutExerciseSetInputSchema).min(1),
});

const WorkoutInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  order: z.number(),
  exercises: z.array(WorkoutExerciseInputSchema).min(1),
});

const PlanInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  goal: z.enum([
    "muscle-gain",
    "fat-loss",
    "recomposition",
    "strength-performance",
    "general-health-fitness",
  ]),
  place: z.enum(["gym", "home"]),
  frequency: z.number().min(1).max(7),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  workout_duration: z.number().min(30).max(120),
  note: z.string().optional(),
  workouts: z.array(WorkoutInputSchema).min(1),
});

export function createCreatePlanTool({
  supabaseClient,
  log,
  onPlanCreated,
}: ToolContext) {
  return tool({
    description:
      "Store workout plan in the database. The input must include the full nested plan data with workouts, exercises, and sets.",
    inputSchema: z.object({
      data: PlanInputSchema,
    }),
    execute: async ({ data }) => {
      log("tool_call", {
        tool: "create_plan",
        data,
      });
      try {
        const { data: planId, error } = await supabaseClient.rpc("store_plan", {
          p_plan_data: data,
        });
        if (error) {
          throw error;
        }
        log("tool_ok", { tool: "create_plan", planId });
        onPlanCreated?.(planId);
        return { success: true, plan_id: planId, plan_name: data.name };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object"
              ? JSON.stringify(err)
              : String(err);
        log("tool_error", { tool: "create_plan", error: message });
        return { error: `Failed to create plan: ${message}` };
      }
    },
  });
}
