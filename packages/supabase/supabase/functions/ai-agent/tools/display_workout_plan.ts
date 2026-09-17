import { tool } from "npm:ai";
import { z } from "npm:zod";

const exerciseSchema = z.object({
  exercise_id: z
    .string()
    .describe(
      "The UUID of the exercise from search_exercises results. Must match an ID returned by search_exercises — do not invent IDs."
    ),
  name: z.string().describe("The display name of the exercise."),
  notes: z.string().optional(),
  reps: z.string(),
  restSeconds: z.number().optional(),
  sets: z.number(),
});

const workoutSchema = z.object({
  dayLabel: z.string(),
  exercises: z.array(exerciseSchema),
  name: z.string(),
});

export const displayWorkoutPlanTool = tool({
  description:
    "Display a generated workout plan as a structured card in the UI. Call this when the user requests a workout plan to be created or generated.",
  execute: async (args) => args,
  inputSchema: z.object({
    description: z.string(),
    experienceLevel: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional(),
    frequencyPerWeek: z.number(),
    goal: z.enum([
      "weight_loss",
      "muscle_gain",
      "strength",
      "endurance",
      "general_fitness",
    ]),
    name: z.string(),
    place: z.enum(["gym", "home"]).optional(),
    workoutDuration: z.number().optional(),
    workouts: z.array(workoutSchema),
  }),
});
