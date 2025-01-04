type Location = "gym" | "home";

export type User = {
  id: number;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
};

export type Plan = {
  id: string;
  user_id: number;
  location: Location;
  frequency: number;
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
  location: Location;
};
