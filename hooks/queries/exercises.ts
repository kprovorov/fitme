import { createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { Exercise } from "~/lib/models";

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
