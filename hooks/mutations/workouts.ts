import { supabase } from "@/lib/supabase";
import { createMutation } from "react-query-kit";
import { Workout } from "~/lib/models";

export const useStartWorkoutMutation = createMutation<Workout, number>({
  mutationFn: async (workoutId: number): Promise<Workout> => {
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
    return data as unknown as Workout;
  },
});

export const useFinishWorkoutMutation = createMutation<Workout, number>({
  mutationFn: async (workoutId: number): Promise<Workout> => {
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
    return data as unknown as Workout;
  },
});
