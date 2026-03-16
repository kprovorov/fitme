import { User, Plan, Workout } from "~/lib/models";

export const mockUser: User = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  profile: {
    id: "profile-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    user_id: "user-1",
    gender: "male",
    age: 30,
    height: 180,
    weight: 80,
    measurement_system: "metric",
    rc_user_id: null,
  },
};

const makeExercise = (n: number) => ({
  id: `exercise-${n}`,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  name: `Exercise ${n}`,
  slug: `exercise-${n}`,
  description: `Description ${n}`,
  instructions: `Instructions ${n}`,
  video_url: "",
  thumbnail_url: "",
  muscle_groups: ["chest" as const],
});

const makeWorkoutExercise = (n: number) => ({
  id: `we-${n}`,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  workout_id: "workout-1",
  workout: {} as any,
  exercise_id: `exercise-${n}`,
  exercise: makeExercise(n),
  order: n,
  sets: [
    {
      id: `set-${n}`,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      workout_exercise_id: `we-${n}`,
      order: 1,
      reps_recommended: 10,
      weight_recommended: 50,
      rest_recommended: 60,
    },
  ],
});

export const mockWorkout: Workout = {
  id: "workout-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  plan_id: "plan-1",
  plan: {} as any,
  name: "Push Day",
  description: "Chest, shoulders, and triceps",
  order: 1,
  exercises: [makeWorkoutExercise(1), makeWorkoutExercise(2)],
  sessions: [],
};

const makeWorkout = (n: number): Workout => ({
  id: `workout-${n}`,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  plan_id: "plan-1",
  plan: {} as any,
  name: `Workout ${n}`,
  description: `Description ${n}`,
  order: n,
  exercises: [makeWorkoutExercise(n)],
  sessions: [],
});

export const mockPlan: Plan = {
  id: "plan-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  user_id: "user-1",
  name: "My Fitness Plan",
  description: "A comprehensive fitness plan",
  goal: "muscle-gain",
  place: "gym",
  frequency: 4,
  experience_level: "intermediate",
  workout_duration: 60,
  is_active: true,
  workouts: [makeWorkout(1), makeWorkout(2), makeWorkout(3)],
};
