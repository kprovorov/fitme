import { supabase } from "@/lib/supabase";
import { WorkoutExercise } from "~/lib/models";
import { createQuery } from "react-query-kit";

type WorkoutExerciseQueryVariables = {
  id: number;
};

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
      `,
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutExercise;
  },
});
