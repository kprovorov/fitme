export type Goal = "lose_weight" | "gain_muscle" | "improve_health";
export type Place = "gym" | "home";
export type Gender = "male" | "female";

export type User = {
  id: number;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
};

export type Profile = {
  id: string;
  user_id: number;
  gender: Gender;
  age: number;
  height: number;
  weight: number;
};

export type WorkoutPlan = {
  id: string;
  user_id: number;
  name: string;
  description: string;
  goal: Goal;
  place: Place;
  frequency: number;
  is_active: boolean;
  workouts: Workout[];
};

export type Workout = {
  id: string;
  plan_id: number;
  name: string;
  description: string;
  exercises: WorkoutExercise[];
  order: number;
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
  weight: number;
  repeats: number;
  rest: number;
  order: number;
};

export type Exercise = {
  id: number;
  name: string;
  description: string;
  place: Place;
};
