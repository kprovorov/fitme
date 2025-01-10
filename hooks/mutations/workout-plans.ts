import { createMutation } from "react-query-kit";
import { api } from "~/lib/api";
import { Goal, Place, WorkoutPlan } from "~/lib/models";

type StoreWorkoutPlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
};

export const useStoreWorkoutPlanMutation = createMutation<
  WorkoutPlan,
  StoreWorkoutPlanData
>({
  mutationFn: async (data: StoreWorkoutPlanData): Promise<WorkoutPlan> => {
    const res = await api.post<WorkoutPlan>("/api/workout-plans", data);

    return res.data;
  },
});
