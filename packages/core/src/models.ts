export const goals = [
  "muscle-gain",
  "fat-loss",
  "recomposition",
  "strength-performance",
  "general-health-fitness",
] as const;
export type Goal = (typeof goals)[number];

export const places = ["gym", "home"] as const;
export type Place = (typeof places)[number];

export const experienceLevels = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type ExperienceLevel = (typeof experienceLevels)[number];

export const genders = ["male", "female"] as const;
export type Gender = (typeof genders)[number];

export const measurementSystems = ["metric", "us", "uk"] as const;
export type MeasurementSystem = (typeof measurementSystems)[number];

export const muscleGroups = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "traps",
  "lats",
  "lower-back",
  "cardio",
  "full-body",
] as const;
export type MuscleGroup = (typeof muscleGroups)[number];

export interface Identifiable {
  id: string;
}

export interface Timestamped {
  created_at: string;
  updated_at: string;
}

export type Model = Identifiable & Timestamped;

export type Profile = Model & {
  user_id: string; // User id (JWT sub claim)
  gender: Gender;
  age: number;
  height: number;
  weight: number;
  measurement_system: MeasurementSystem;
};

export type Plan = Model & {
  user_id: string; // User id (JWT sub claim)
  name: string;
  description: string;
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
  is_active: boolean;
  workouts: Workout[];
};

export type Workout = Model & {
  plan_id: string;
  plan: Plan;
  name: string;
  description: string;
  order: number;
  exercises: WorkoutExercise[];
  sessions: WorkoutSession[];
};

export type WorkoutExercise = Model & {
  workout_id: string;
  workout: Workout;
  /** The Exercise, by its Exercise slug: details come from the Exercise Library API. */
  exercise_slug: string;
  order: number;
  sets: WorkoutExerciseSet[];
};

export type WorkoutExerciseSet = Model & {
  workout_exercise_id: string;
  order: number;
  reps_recommended: number;
  weight_recommended: number;
  rest_recommended: number;
};

export type WorkoutSession = Model & {
  workout_id: string | null;
  plan_id: string | null;
  user_id: string;
  started_at: string;
  finished_at: string;
  exercises: WorkoutSessionExercise[];
  workout: Workout | null;
};

export type WorkoutSessionExercise = Model & {
  workout_session_id: string;
  /** The Exercise, by its Exercise slug: details come from the Exercise Library API. */
  exercise_slug: string;
  order: number;
  sets: WorkoutSessionExerciseSet[];
};

export type WorkoutSessionExerciseSet = Model & {
  workout_session_exercise_id: string;
  order: number;
  reps_recommended: number | null;
  weight_recommended: number | null;
  rest_recommended: number | null;
  reps_completed: number | null;
  weight_completed: number | null;
  logged_at: string | null;
};

export interface PlanData {
  description: string;
  experience_level: ExperienceLevel;
  frequency: number;
  goal: Goal;
  name: string;
  note?: string;
  place: Place;
  workout_duration: number;
  workouts: WorkoutData[];
}

export interface WorkoutData {
  description: string;
  exercises: WorkoutExerciseData[];
  name: string;
  order: number;
}

export interface WorkoutExerciseData {
  exercise_slug: string;
  order: number;
  sets: WorkoutExerciseSetData[];
}

export interface WorkoutExerciseSetData {
  order: number;
  reps_recommended: number;
  rest_recommended: number;
  weight_recommended: number;
}

/**
 * Payload for the plan RPCs. They derive `order` from each item's position
 * in the arrays, so the payload carries no `order` fields.
 */
export interface PlanInput extends Omit<PlanData, "workouts"> {
  workouts: WorkoutInput[];
}

export interface WorkoutInput {
  description: string;
  exercises: WorkoutExerciseInput[];
  name: string;
}

export interface WorkoutExerciseInput {
  exercise_slug: string;
  sets: WorkoutExerciseSetInput[];
}

export type WorkoutExerciseSetInput = Omit<WorkoutExerciseSetData, "order">;

/**
 * Models the Coach can run on, by their Vercel AI Gateway id
 * (`<creator>/<model>`), the only list: `apps/coach` rejects any id outside it.
 */
export const coachModels = [
  {
    description: "Fast and capable, balanced for everyday coaching",
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
  },
  {
    description: "GPT-5.6 Luna variant",
    id: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
  },
  {
    description: "GPT-5.6 Sol variant",
    id: "openai/gpt-5.6-sol",
    label: "GPT-5.6 Sol",
  },
  {
    description: "GPT-5.6 Terra variant",
    id: "openai/gpt-5.6-terra",
    label: "GPT-5.6 Terra",
  },
  {
    description: "Strong reasoning with a natural conversational tone",
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
  },
  {
    description: "Most thorough answers for complex plans and analysis",
    id: "anthropic/claude-opus-5",
    label: "Claude Opus 5",
  },
  {
    description: "Quickest replies for short questions",
    id: "anthropic/claude-haiku-4.5",
    label: "Claude Haiku 4.5",
  },
] as const satisfies readonly {
  description: string;
  id: `${string}/${string}`;
  label: string;
}[];

export type CoachModel = (typeof coachModels)[number];
export type CoachModelId = CoachModel["id"];

export const defaultCoachModelId: CoachModelId = "openai/gpt-5.5";

export function isCoachModelId(value: unknown): value is CoachModelId {
  return coachModels.some((model) => model.id === value);
}

/** The RevenueCat entitlement that makes a User Pro (and unlocks the Coach). */
export const proEntitlement = "Fitme Pro";

/**
 * Stable `code`s of the Coach channel's `{ ok: false, code, error }` refusals:
 * `proRequired` (403) shows the paywall; `proCheckUnavailable` (503) means
 * the subscription couldn't be checked, so retry instead.
 */
export const coachErrorCodes = {
  proCheckUnavailable: "coach_pro_check_unavailable",
  proRequired: "coach_pro_required",
} as const;
