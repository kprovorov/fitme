import { createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { Workout } from "~/lib/models";

export type WorkoutQueryVariables = {
  id: number;
};

export const useWorkoutQuery = createQuery<Workout, WorkoutQueryVariables>({
  queryKey: ["workout"],
  fetcher: async ({ id }: WorkoutQueryVariables): Promise<Workout> => {
    const res = await api.get<Workout>(`/api/workouts/${id}`);

    return res.data;
  },
});
