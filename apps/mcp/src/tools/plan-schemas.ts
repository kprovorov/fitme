import { experienceLevels, goals, places } from "@fitme/core";
import {
  MAX_EXERCISES_PER_WORKOUT,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WEIGHT,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUTS_PER_PLAN,
  MIN_FREQUENCY,
} from "@fitme/core/limits";
import { z } from "zod";

import { exerciseSlugSchema } from "./library.js";

const setSchema = z.object({
  reps_recommended: z
    .number()
    .int()
    .min(1)
    .max(MAX_REPS)
    .describe("Target repetitions for the set."),
  rest_recommended: z
    .number()
    .int()
    .min(0)
    .max(MAX_REST_SECONDS)
    .describe("Rest after the set, in seconds."),
  weight_recommended: z
    .number()
    .min(0)
    .max(MAX_WEIGHT)
    .describe(
      "Target weight in the user's unit (kg for metric, lbs for us/uk). Use 0 for bodyweight exercises."
    ),
});

const exerciseSchema = z.object({
  exercise_slug: exerciseSlugSchema,
  sets: z
    .array(setSchema)
    .min(1)
    .max(MAX_SETS_PER_EXERCISE)
    .describe("Sets in the order they are performed."),
});

const workoutSchema = z.object({
  description: z
    .string()
    .max(MAX_PLAN_TEXT_LENGTH)
    .describe("Short description of the workout's focus."),
  exercises: z
    .array(exerciseSchema)
    .min(1)
    .max(MAX_EXERCISES_PER_WORKOUT)
    .describe("Exercises in the order they are performed."),
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PLAN_NAME_LENGTH)
    .describe("Workout name, e.g. 'Push Day'."),
});

export const workoutsSchema = z
  .array(workoutSchema)
  .min(1)
  .max(MAX_WORKOUTS_PER_PLAN)
  .describe(
    "Workouts in rotation order. Order is derived from array position — do not send `order` fields."
  );

/** Plan metadata columns (everything except the workouts). */
export const planMetadataShape = {
  description: z
    .string()
    .max(MAX_PLAN_TEXT_LENGTH)
    .describe("Plan description."),
  experience_level: z.enum(experienceLevels),
  frequency: z
    .number()
    .int()
    .min(MIN_FREQUENCY)
    .max(MAX_FREQUENCY)
    .describe("Training days per week."),
  goal: z.enum(goals),
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PLAN_NAME_LENGTH)
    .describe("Plan name."),
  place: z.enum(places),
  workout_duration: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKOUT_DURATION_MINUTES)
    .describe("Target workout length in minutes."),
};

export const planNoteSchema = z
  .string()
  .max(MAX_PLAN_TEXT_LENGTH)
  .describe("Free-form note shown with the plan.");
