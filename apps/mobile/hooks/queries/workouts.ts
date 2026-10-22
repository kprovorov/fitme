import type { Workout } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

export interface WorkoutQueryVariables {
  id: string;
}

export const useWorkoutQuery = createQuery<Workout, WorkoutQueryVariables>({
  fetcher: async ({ id }: WorkoutQueryVariables): Promise<Workout> => {
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
      .eq("id", id)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as Workout;
  },
  queryKey: ["workout"],
});
