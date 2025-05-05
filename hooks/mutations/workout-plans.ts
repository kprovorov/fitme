import { AxiosError } from "axios";
import { createMutation } from "react-query-kit";
import { api, ServerError } from "~/lib/api";
import { Goal, Place, Plan } from "~/lib/models";

type StoreWorkoutPlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
};

export const useStoreWorkoutPlanMutation = createMutation<
  Plan,
  StoreWorkoutPlanData,
  AxiosError<ServerError<StoreWorkoutPlanData>>
>({
  mutationFn: async (data: StoreWorkoutPlanData): Promise<Plan> => {
    const res = await api.post<Plan>("/api/workout-plans", data);

    return res.data;
  },
});

export const useGenerateWorkoutPlanMutation = createMutation<
  Plan,
  { id: number },
  AxiosError<ServerError<{ id: number }>>
>({
  mutationFn: async (data: { id: number }): Promise<Plan> => {
    const res = await api.patch<Plan>(`/api/workout-plans/${data.id}/generate`);

    return res.data;
  },
});
