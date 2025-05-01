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

export type Identifiable = {
  id: number;
};

export type Timestamped = {
  created_at: string;
  updated_at: string;
};

export type Model = Identifiable & Timestamped;

export type User = Model & {
  name: string;
  email: string;
  rc_user_id: string;
  measurement_system: MeasurementSystem;
  profile?: Profile;
};

export type Profile = Model & {
  gender: Gender;
  age: number;
  height: number;
  weight: number;
  user_id: number;
};

export type Exercise = Model & {
  name: string;
  slug: string;
  description: string;
  instructions: string;
  video_url: string;
  thumbnail_url: string;
};

export type Plan = Model & {
  user_id: number;
  name: string;
  description: string;
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
  is_generating: boolean;
  is_active: boolean;
  workouts: Workout[];
};

export type Workout = Model & {
  plan_id: number;
  plan: Plan;
  name: string;
  description: string;
  order: number;
  exercises: WorkoutExercise[];
  sessions: WorkoutSession[];
};

export type WorkoutExercise = Model & {
  workout_id: number;
  workout: Workout;
  exercise_id: number;
  exercise: Exercise;
  order: number;
  sets: WorkoutExerciseSet[];
};

export type WorkoutExerciseSet = Model & {
  workout_exercise_id: number;
  order: number;
  reps_recommended: number;
  weight_recommended: number;
  rest_recommended: number;
};

export type WorkoutSession = Model & {
  workout_id: number;
  started_at: string;
  finished_at: string;
  exercises: WorkoutSessionExercise[];
  workout: Workout;
};

export type WorkoutSessionExercise = Model & {
  workout_session_id: number;
  exercise_id: number;
  order: number;
  exercise: Exercise;
  sets: WorkoutSessionExerciseSet[];
};

export type WorkoutSessionExerciseSet = Model & {
  workout_session_exercise_id: number;
  order: number;
  reps_recommended: number;
  weight_recommended: number;
  rest_recommended: number;
  reps_completed: number | null;
  weight_completed: number | null;
  logged_at: string | null;
};

export type PlanData = {
  name: string;
  description: string;
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
  workouts: WorkoutData[];
};

export type WorkoutData = {
  name: string;
  description: string;
  order: number;
  exercises: WorkoutExerciseData[];
};

export type WorkoutExerciseData = {
  exercise_id: number;
  exercise: Exercise;
  order: number;
  sets: WorkoutExerciseSetData[];
};

export type WorkoutExerciseSetData = {
  order: number;
  reps_recommended: number;
  weight_recommended: number;
  rest_recommended: number;
};
