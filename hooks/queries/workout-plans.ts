import { api } from "@/lib/api";
import { WorkoutPlan } from "@/lib/models";
import { createQuery } from "react-query-kit";

export const useWorkoutPlansQuery = createQuery<WorkoutPlan[]>({
  queryKey: ["workout-plans"],
  fetcher: async (): Promise<WorkoutPlan[]> => {
    const res = await api.get<WorkoutPlan[]>("/api/workout-plans");

    return res.data;
  },
});

export type WorkoutPlanQueryVariables = {
  id: number;
};

export const useWorkoutPlanQuery = createQuery<
  WorkoutPlan,
  WorkoutPlanQueryVariables
>({
  queryKey: ["workout-plan"],
  fetcher: async ({ id }: WorkoutPlanQueryVariables): Promise<WorkoutPlan> => {
    const res = await api.get<WorkoutPlan>(`/api/workout-plans/${id}`);

    return res.data;
  },
});
