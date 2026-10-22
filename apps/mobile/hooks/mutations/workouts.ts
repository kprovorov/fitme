import type { Workout } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

export const useStartWorkoutMutation = createMutation<Workout, string>({
  mutationFn: async (workoutId: string): Promise<Workout> => {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        *,
        plan:plans (*),
        exercises:workout_exercises (
          *,
          sets:workout_exercise_sets (*)
        ),
        sessions:workout_sessions (*)
      `
      )
      .eq("id", workoutId)
      .single();
    if (error) {
      throw error;
    }
    const workout = data as unknown as Workout;
    if (!IS_E2E) {
      segmentClient.track("Workout Started", {
        plan_id: workout.plan_id,
        workout_id: workout.id,
      });
    }
    return workout;
  },
});

export const useFinishWorkoutMutation = createMutation<Workout, string>({
  mutationFn: async (workoutId: string): Promise<Workout> => {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
        *,
        plan:plans (*),
        exercises:workout_exercises (
          *,
          sets:workout_exercise_sets (*)
        ),
        sessions:workout_sessions (*)
      `
      )
      .eq("id", workoutId)
      .single();
    if (error) {
      throw error;
    }
    const workout = data as unknown as Workout;
    if (!IS_E2E) {
      segmentClient.track("Workout Completed", {
        plan_id: workout.plan_id,
        workout_id: workout.id,
      });
    }
    return workout;
  },
});
