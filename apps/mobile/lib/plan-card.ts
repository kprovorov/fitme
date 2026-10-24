import {
  type ExperienceLevel,
  type Goal,
  MAX_EXERCISES_PER_WORKOUT,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUTS_PER_PLAN,
  MIN_FREQUENCY,
} from "@fitme/core";
import type { components } from "~/lib/api/schema";

/**
 * An Exercise of `display_workout_plan`'s result, by Exercise slug. A card
 * saved in a Conversation from before slugs has no slug.
 */
export interface WorkoutExercise {
  exercise_slug?: string;
  name: string;
  notes?: string;
  reps: string;
  restSeconds?: number;
  sets: number;
}

export interface WorkoutDay {
  dayLabel: string;
  exercises: WorkoutExercise[];
  name: string;
}

/** `display_workout_plan`'s result: the Coach's suggestion, loosely bounded. */
export interface WorkoutPlan {
  description: string;
  experienceLevel?: ExperienceLevel;
  frequencyPerWeek: number;
  goal:
    | "weight_loss"
    | "muscle_gain"
    | "strength"
    | "endurance"
    | "general_fitness";
  name: string;
  place?: "gym" | "home";
  workoutDuration?: number;
  workouts: WorkoutDay[];
}

export type NewPlan = Omit<components["schemas"]["NewPlan"], "activate">;

const GOALS: Record<WorkoutPlan["goal"], Goal> = {
  endurance: "general-health-fitness",
  general_fitness: "general-health-fitness",
  muscle_gain: "muscle-gain",
  strength: "strength-performance",
  weight_loss: "fat-loss",
};

const DEFAULT_REPS = 10;
const DEFAULT_REST_SECONDS = 90;
const DEFAULT_WORKOUT_DURATION_MINUTES = 60;
const DEFAULT_PLAN_NAME = "Workout plan";

const REPS_RE = /^\d+/;

// The card is the Coach's tool output, from any Conversation however old, so
// the helpers below take its fields as `unknown`: a missing or malformed one
// gets the default rather than failing the save.

/** `value` rounded to an integer within `min`–`max`; `fallback` if it isn't a number. */
const fitInteger = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

/** The first number of the Coach's reps ("8-10" → 8). */
const repsOf = (reps: unknown) => {
  const match = typeof reps === "string" ? reps.match(REPS_RE) : null;
  return fitInteger(
    match ? Number.parseInt(match[0], 10) : DEFAULT_REPS,
    1,
    MAX_REPS,
    DEFAULT_REPS
  );
};

const nameOf = (name: unknown, fallback: string) => {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return (trimmed || fallback).slice(0, MAX_PLAN_NAME_LENGTH);
};

const textOf = (text: unknown) =>
  (typeof text === "string" ? text : "").slice(0, MAX_PLAN_TEXT_LENGTH);

/** Whether some Exercise of the card has no slug. */
export const hasExercisesWithoutSlugs = (plan: WorkoutPlan) =>
  plan.workouts.some((workout) =>
    workout.exercises.some((exercise) => !exercise.exercise_slug)
  );

/**
 * Whether a card can be saved: every Exercise has a slug (a card from before
 * slugs can't be saved) and some Workout has an Exercise.
 */
export const canSavePlanCard = (plan: WorkoutPlan) =>
  plan.workouts.some((workout) => workout.exercises.length > 0) &&
  !hasExercisesWithoutSlugs(plan);

/**
 * The `POST /v1/plans` body for a card, fitted into the Public API's bounds
 * (`@fitme/core`'s limits): the card is a suggestion, so it's adjusted rather
 * than refused. Set counts, reps and rest are clamped and rounded to
 * integers, as are frequency and Workout duration; Workouts without Exercises
 * are left out, and lists and text cut to their maximum. Every set starts at
 * no weight. `null` when the card can't be saved (`canSavePlanCard`).
 */
export const planCardBody = (plan: WorkoutPlan): NewPlan | null => {
  if (!canSavePlanCard(plan)) {
    return null;
  }
  const workouts = plan.workouts
    .filter((workout) => workout.exercises.length > 0)
    .slice(0, MAX_WORKOUTS_PER_PLAN)
    .map((workout, index) => ({
      description: "",
      exercises: workout.exercises
        .slice(0, MAX_EXERCISES_PER_WORKOUT)
        .map((exercise) => {
          const set = {
            reps_recommended: repsOf(exercise.reps),
            rest_recommended: fitInteger(
              exercise.restSeconds,
              0,
              MAX_REST_SECONDS,
              DEFAULT_REST_SECONDS
            ),
            weight_recommended: 0,
          };
          return {
            // Never empty: `canSavePlanCard` refuses a card without slugs.
            exercise_slug: exercise.exercise_slug ?? "",
            sets: Array.from(
              {
                length: fitInteger(exercise.sets, 1, MAX_SETS_PER_EXERCISE, 1),
              },
              () => ({ ...set })
            ),
          };
        }),
      name: nameOf(workout.name, workout.dayLabel || `Workout ${index + 1}`),
    }));

  return {
    description: textOf(plan.description),
    experience_level: plan.experienceLevel ?? "intermediate",
    frequency: fitInteger(
      plan.frequencyPerWeek,
      MIN_FREQUENCY,
      MAX_FREQUENCY,
      MIN_FREQUENCY
    ),
    goal: GOALS[plan.goal] ?? "general-health-fitness",
    name: nameOf(plan.name, DEFAULT_PLAN_NAME),
    place: plan.place ?? "gym",
    workout_duration: fitInteger(
      plan.workoutDuration,
      1,
      MAX_WORKOUT_DURATION_MINUTES,
      DEFAULT_WORKOUT_DURATION_MINUTES
    ),
    workouts,
  };
};
