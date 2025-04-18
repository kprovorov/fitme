import { createQuery } from "react-query-kit";
import { api } from "~/lib/api";
import { PlanWorkout } from "~/lib/models";

export type WorkoutQueryVariables = {
  id: number;
};

export const useWorkoutQuery = createQuery<PlanWorkout, WorkoutQueryVariables>({
  queryKey: ["workout"],
  fetcher: async ({ id }: WorkoutQueryVariables): Promise<PlanWorkout> => {
    const res = await api.get<PlanWorkout>(`/api/workouts/${id}`);

    return res.data;
  },
});
