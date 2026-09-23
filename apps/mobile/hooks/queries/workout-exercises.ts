import type { WorkoutExercise } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

interface WorkoutExerciseQueryVariables {
  id: string;
}

export const useWorkoutExerciseQuery = createQuery<
  WorkoutExercise,
  WorkoutExerciseQueryVariables
>({
  fetcher: async ({
    id,
  }: WorkoutExerciseQueryVariables): Promise<WorkoutExercise> => {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select(
        `
        *,
        workout:workouts (*),
        exercise:exercises (*),
        sets:workout_exercise_sets (*)
      `
      )
      .eq("id", id)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as WorkoutExercise;
  },
  queryKey: ["workout-exercise"],
});
