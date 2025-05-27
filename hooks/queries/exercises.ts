import { createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { Exercise, WorkoutSessionExerciseSet } from "~/lib/models";

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

export const useExerciseHistoryQuery = createQuery<
  WorkoutSessionExerciseSet[],
  ExerciseQueryVariables
>({
  queryKey: ["exercise-history"],
  fetcher: async ({
    exerciseId,
  }: ExerciseQueryVariables): Promise<WorkoutSessionExerciseSet[]> => {
    const res = await api.get<WorkoutSessionExerciseSet[]>(
      `/api/exercises/${exerciseId}/history`,
    );
    return res.data;
  },
});
