import type { WorkoutSessionExercise } from "@fitme/core";
import { createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

interface ExerciseHistoryQueryVariables {
  exerciseSlug: string;
}

/** The User's Workout Session entries for an Exercise, newest first, logged sets only. */
export const useExerciseHistoryQuery = createQuery<
  WorkoutSessionExercise[],
  ExerciseHistoryQueryVariables
>({
  fetcher: async ({
    exerciseSlug,
  }: ExerciseHistoryQueryVariables): Promise<WorkoutSessionExercise[]> => {
    const { data, error } = await supabase
      .from("workout_session_exercises")
      .select(
        `
        *,
        sets:workout_session_exercise_sets (*),
        session:workout_sessions (
          *,
          workout:workouts (
            *,
            plan:plans (*)
          )
        )
      `
      )
      .eq("exercise_slug", exerciseSlug)
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }
    interface WseRaw {
      sets: Array<{ reps_completed: unknown }>;
    }
    // Logged sets only: reps are recorded on every logged set, a weight only
    // when the exercise has one (bodyweight sets have none).
    const withCompletedSets = (data ?? [])
      .map((wse: WseRaw) => ({
        ...wse,
        sets: wse.sets.filter((set) => set.reps_completed !== null),
      }))
      .filter((wse: WseRaw) => wse.sets.length > 0);
    return withCompletedSets as unknown as WorkoutSessionExercise[];
  },
  queryKey: ["exercise-history"],
});
