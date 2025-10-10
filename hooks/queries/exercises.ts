import { createInfiniteQuery, createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { Exercise, WorkoutSessionExercise } from "~/lib/models";
import { PaginatedResponse } from "~/lib/types";

interface ExerciseQueryVariables {
  exerciseId: number;
}

export const useExerciseQuery = createQuery<Exercise, ExerciseQueryVariables>({
  queryKey: ["exercise"],
  fetcher: async ({
    exerciseId,
  }: ExerciseQueryVariables): Promise<Exercise> => {
    const res = await api.get<Exercise>(`/api/exercises/${exerciseId}`);

    return res.data;
  },
});

interface ExercisesQueryVariables {
  muscleGroup?: string;
}

export const useExercisesQuery = createInfiniteQuery<
  PaginatedResponse<Exercise>,
  ExercisesQueryVariables
>({
  queryKey: ["exercises"],
  fetcher: async (
    { muscleGroup },
    { pageParam },
  ): Promise<PaginatedResponse<Exercise>> => {
    const res = await api.get<PaginatedResponse<Exercise>>(`/api/exercises`, {
      params: {
        muscle_group: muscleGroup,
        page: pageParam,
      },
    });
    return res.data;
  },
  getNextPageParam: ({ last_page, current_page }) =>
    last_page > current_page ? current_page + 1 : undefined,
  getPreviousPageParam: ({ current_page }) =>
    current_page > 1 ? current_page - 1 : undefined,
  initialPageParam: 1,
});

export const useExerciseHistoryQuery = createQuery<
  WorkoutSessionExercise[],
  ExerciseQueryVariables
>({
  queryKey: ["exercise-history"],
  fetcher: async ({
    exerciseId,
  }: ExerciseQueryVariables): Promise<WorkoutSessionExercise[]> => {
    const res = await api.get<WorkoutSessionExercise[]>(
      `/api/exercises/${exerciseId}/history`,
    );
    return res.data;
  },
});
