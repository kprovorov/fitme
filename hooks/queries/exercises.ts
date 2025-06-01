import { createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { Exercise, WorkoutSessionExercise } from "~/lib/models";

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
