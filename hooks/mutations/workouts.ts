import { supabase } from "@/lib/supabase";
import { createMutation } from "react-query-kit";
import { Workout } from "~/lib/models";
import { segmentClient } from "~/lib/segment";
import { IS_E2E } from "~/lib/constants";

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
          exercise:exercises (*),
          sets:workout_exercise_sets (*)
        ),
        sessions:workout_sessions (*)
      `,
      )
      .eq("id", workoutId)
      .single();
    if (error) throw error;
    const workout = data as unknown as Workout;
    if (!IS_E2E)
      segmentClient.track("Workout Started", {
        workout_id: workout.id,
        plan_id: workout.plan_id,
      });
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
          exercise:exercises (*),
          sets:workout_exercise_sets (*)
        ),
        sessions:workout_sessions (*)
      `,
      )
      .eq("id", workoutId)
      .single();
    if (error) throw error;
    const workout = data as unknown as Workout;
    if (!IS_E2E)
      segmentClient.track("Workout Completed", {
        workout_id: workout.id,
        plan_id: workout.plan_id,
      });
    return workout;
  },
});
