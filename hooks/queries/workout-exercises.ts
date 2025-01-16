import { createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { WorkoutExercise } from "~/lib/models";

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
    const res = await api.get<WorkoutExercise>(`/api/workout-exercises/${id}`);

    return res.data;
  },
});
