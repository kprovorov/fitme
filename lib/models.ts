export type Goal = "lose_weight" | "gain_muscle" | "improve_health";
export type Place = "gym" | "home";
export type Gender = "male" | "female";

export const measurementSystems = ["metric", "us", "uk"] as const;
export type MeasurementSystem = (typeof measurementSystems)[number];

export type User = {
  id: number;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  rc_user_id: string;
  profile?: Profile;
  measurement_system: MeasurementSystem;
};

export type Profile = {
  id: string;
  user_id: number;
  gender: Gender;
  age: number;
  height: number;
  weight: number;
};

export type Plan = {
  id: number;
  user_id: number;
  name: string;
  description: string;
  goal: Goal;
  place: Place;
  frequency: number;
  is_active: boolean;
  workouts: Workout[];
  is_generating: boolean;
};

export type Workout = {
  id: number;
  plan_id: number;
  name: string;
  description: string;
  exercises: WorkoutExercise[];
  order: number;
  started_at: string;
  finished_at: string;
};

export type WorkoutExercise = {
  id: number;
  workout_id: number;
  exercise_id: number;
  order: number;
  sets: WorkoutExerciseSet[];
  exercise: Exercise;
};

export type WorkoutExerciseSet = {
  id: number;
  workout_exercise_id: number;
  weight_recommended: number;
  repeats_recommended: number;
  rest_recommended: number;
  order: number;
  weight_done: number | null;
  repeats_done: number | null;
};

export type Exercise = {
  id: number;
  name: string;
  description: string;
  instructions: string;
  video_url: string;
  thumbnail_url: string;
};
