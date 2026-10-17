import { experienceLevels, goals, places } from "@fitme/core";
import { z } from "zod";
import { MAX_REPS, MAX_WEIGHT } from "./limits.js";

const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
const MAX_WORKOUTS = 14;
const MAX_EXERCISES_PER_WORKOUT = 30;
const MAX_SETS_PER_EXERCISE = 20;
const MAX_REST_SECONDS = 3600;
const MIN_FREQUENCY = 1;
const MAX_FREQUENCY = 7;
const MAX_WORKOUT_DURATION_MINUTES = 600;

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
  exercise_id: z
    .guid()
    .describe("Exercise library id from list_exercises (exercises.id)."),
  sets: z
    .array(setSchema)
    .min(1)
    .max(MAX_SETS_PER_EXERCISE)
    .describe("Sets in the order they are performed."),
});

const workoutSchema = z.object({
  description: z
    .string()
    .max(MAX_TEXT_LENGTH)
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
    .max(MAX_NAME_LENGTH)
    .describe("Workout name, e.g. 'Push Day'."),
});

export const workoutsSchema = z
  .array(workoutSchema)
  .min(1)
  .max(MAX_WORKOUTS)
  .describe(
    "Workouts in rotation order. Order is derived from array position — do not send `order` fields."
  );

/** Plan metadata columns (everything except the workouts). */
export const planMetadataShape = {
  description: z.string().max(MAX_TEXT_LENGTH).describe("Plan description."),
  experience_level: z.enum(experienceLevels),
  frequency: z
    .number()
    .int()
    .min(MIN_FREQUENCY)
    .max(MAX_FREQUENCY)
    .describe("Training days per week."),
  goal: z.enum(goals),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH).describe("Plan name."),
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
  .max(MAX_TEXT_LENGTH)
  .describe("Free-form note shown with the plan.");
