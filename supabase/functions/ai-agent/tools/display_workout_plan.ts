import { tool } from "npm:ai";
import { z } from "npm:zod";

const exerciseSchema = z.object({
  name: z.string(),
  sets: z.number(),
  reps: z.string(),
  restSeconds: z.number().optional(),
  notes: z.string().optional(),
});

const workoutSchema = z.object({
  name: z.string(),
  dayLabel: z.string(),
  exercises: z.array(exerciseSchema),
});

export const displayWorkoutPlanTool = tool({
  description:
    "Display a generated workout plan as a structured card in the UI. Call this when the user requests a workout plan to be created or generated.",
  inputSchema: z.object({
    name: z.string(),
    description: z.string(),
    goal: z.enum([
      "weight_loss",
      "muscle_gain",
      "strength",
      "endurance",
      "general_fitness",
    ]),
    frequencyPerWeek: z.number(),
    place: z.enum(["gym", "home"]).optional(),
    workouts: z.array(workoutSchema),
  }),
  execute: async (args) => args,
});
