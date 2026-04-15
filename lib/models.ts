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

export interface User {
  email: string;
  id: string; // UUID from auth.users
  name: string;
  profile?: Profile;
}

export type Profile = Model & {
  user_id: string; // UUID from auth.users
  gender: Gender;
  age: number;
  height: number;
  weight: number;
  measurement_system: MeasurementSystem;
};

export type Exercise = Model & {
  name: string;
  slug: string;
  description: string;
  instructions: string;
  video_url: string;
  thumbnail_url: string;
  muscle_groups: MuscleGroup[];
};

export type Plan = Model & {
  user_id: string; // UUID from auth.users
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
  exercise_id: string;
  exercise: Exercise;
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
  workout_id: string;
  started_at: string;
  finished_at: string;
  exercises: WorkoutSessionExercise[];
  workout: Workout;
};

export type WorkoutSessionExercise = Model & {
  workout_session_id: string;
  exercise_id: string;
  order: number;
  exercise: Exercise;
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
  exercise: Exercise;
  exercise_id: string;
  order: number;
  sets: WorkoutExerciseSetData[];
}

export interface WorkoutExerciseSetData {
  order: number;
  reps_recommended: number;
  rest_recommended: number;
  weight_recommended: number;
}

export interface Conversation {
  created_at: string;
  id: string;
  user_id: string;
}

export interface ConversationWithPreview {
  created_at: string;
  id: string;
  preview: string | null;
  user_id: string;
}

export interface MessageAttachment {
  data: PlanData;
  planId: string;
  type: "plan_preview";
}

export interface Message {
  content: string;
  conversation_id: string;
  created_at: string;
  id: string;
  metadata?: { attachment?: MessageAttachment };
  role: "user" | "assistant";
}

export interface AgentResponse {
  attachment?: MessageAttachment;
  conversation_id: string;
  message: string;
}
