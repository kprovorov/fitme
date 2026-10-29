import type { Workout } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

export interface WorkoutQueryVariables {
  id: string;
}

/** PostgREST's answer to `single()` when no row matched. */
const NO_ROW = "PGRST116";

/**
 * A Workout with its Plan, Exercises, sets and sessions, or `null` once it's
 * gone: replaced by a Plan edit (no row), or its Plan soft-deleted (RLS still
 * returns those). Nested rows come unordered.
 */
export const useWorkoutQuery = createQuery<
  Workout | null,
  WorkoutQueryVariables
>({
  fetcher: async ({ id }: WorkoutQueryVariables): Promise<Workout | null> => {
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
      if (error.code === NO_ROW) {
        return null;
      }
      throw error;
    }
    if (!data.plan || data.plan.deleted_at !== null) {
      return null;
    }
    return data as unknown as Workout;
  },
  queryKey: ["workout"],
});
