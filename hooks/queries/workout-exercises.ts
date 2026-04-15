import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import type { WorkoutExercise } from "~/lib/models";

interface WorkoutExerciseQueryVariables {
  id: string;
}

export const useWorkoutExerciseQuery = createQuery<
  WorkoutExercise,
  WorkoutExerciseQueryVariables
>({
  queryKey: ["workout-exercise"],
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
});
