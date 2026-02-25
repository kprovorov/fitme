import { supabase } from "@/lib/supabase";
import { Workout } from "~/lib/models";
import { createQuery } from "react-query-kit";

export type WorkoutQueryVariables = {
  id: number;
};

export const useWorkoutQuery = createQuery<Workout, WorkoutQueryVariables>({
  queryKey: ["workout"],
  fetcher: async ({ id }: WorkoutQueryVariables): Promise<Workout> => {
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
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as unknown as Workout;
  },
});
