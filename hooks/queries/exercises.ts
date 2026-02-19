import { supabase } from "@/lib/supabase";
import { createInfiniteQuery, createQuery } from "react-query-kit";
import { Exercise, WorkoutSessionExercise } from "~/lib/models";
import { SupabasePaginatedResponse } from "~/lib/types";

const PAGE_SIZE = 20;

interface ExerciseQueryVariables {
  exerciseId: number;
}

export const useExerciseQuery = createQuery<Exercise, ExerciseQueryVariables>({
  queryKey: ["exercise"],
  fetcher: async ({
    exerciseId,
  }: ExerciseQueryVariables): Promise<Exercise> => {
    const { data, error } = await supabase
      .from("exercises")
      .select("*")
      .eq("id", exerciseId)
      .single();
    if (error) throw error;
    return data as unknown as Exercise;
  },
});

interface ExercisesQueryVariables {
  muscleGroup?: string;
}

export const useExercisesQuery = createInfiniteQuery<
  SupabasePaginatedResponse<Exercise>,
  ExercisesQueryVariables
>({
  queryKey: ["exercises"],
  fetcher: async (
    { muscleGroup },
    { pageParam },
  ): Promise<SupabasePaginatedResponse<Exercise>> => {
    const page = (pageParam as number) ?? 0;
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
    if (error) throw error;

    const total = count ?? 0;
    return {
      data: (data as unknown as Exercise[]) ?? [],
      total,
      page,
      hasMore: from + PAGE_SIZE < total,
    };
  },
  getNextPageParam: (lastPage) =>
    lastPage.hasMore ? lastPage.page + 1 : undefined,
  getPreviousPageParam: (firstPage) =>
    firstPage.page > 0 ? firstPage.page - 1 : undefined,
  initialPageParam: 0,
});

export const useExerciseHistoryQuery = createQuery<
  WorkoutSessionExercise[],
  ExerciseQueryVariables
>({
  queryKey: ["exercise-history"],
  fetcher: async ({
    exerciseId,
  }: ExerciseQueryVariables): Promise<WorkoutSessionExercise[]> => {
    const { data, error } = await supabase
      .from("workout_session_exercises")
      .select(
        `
        *,
        exercise:exercises (*),
        sets:workout_session_exercise_sets (*),
        session:workout_sessions (
          *,
          workout:workouts (
            *,
            plan:plans (*)
          )
        )
      `,
      )
      .eq("exercise_id", exerciseId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // Filter to only completed sessions client-side for reliability
    const completed = (data ?? []).filter(
      (wse: any) => wse.session?.finished_at != null,
    );
    return completed as unknown as WorkoutSessionExercise[];
  },
});
