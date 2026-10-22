import type {
  Exercise,
  SupabasePaginatedResponse,
  WorkoutSessionExercise,
} from "@fitme/core";
import { createInfiniteQuery, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

// The Library tab and the Exercise picker still list the legacy `exercises`
// table until they move to the Exercise Library API (FIT-242); everything
// else reads Exercises from that API by slug (`./exercise-library`).

interface ExercisesQueryVariables {
  muscleGroup?: string;
}

export const useExercisesQuery = createInfiniteQuery<
  SupabasePaginatedResponse<Exercise>,
  ExercisesQueryVariables
>({
  fetcher: async (
    { muscleGroup },
    { pageParam }
  ): Promise<SupabasePaginatedResponse<Exercise>> => {
    const page = (pageParam as number | undefined) ?? 0;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("exercises")
      .select("*", { count: "exact" })
      .order("name");

    if (muscleGroup) {
      query = query.contains("muscle_groups", JSON.stringify([muscleGroup]));
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw error;
    }

    const total = count ?? 0;
    return {
      data: (data as unknown as Exercise[] | null) ?? [],
      hasMore: from + PAGE_SIZE < total,
      page,
      total,
    };
  },
  getNextPageParam: (lastPage) =>
    lastPage.hasMore ? lastPage.page + 1 : undefined,
  getPreviousPageParam: (firstPage) =>
    firstPage.page > 0 ? firstPage.page - 1 : undefined,
  initialPageParam: 0,
  queryKey: ["exercises"],
});

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
