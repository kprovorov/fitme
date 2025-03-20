import { AxiosError } from "axios";
import { createMutation } from "react-query-kit";
import { api, ServerError } from "~/lib/api";
import { Goal, Place, WorkoutPlan } from "~/lib/models";

type StoreWorkoutPlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
};

export const useStoreWorkoutPlanMutation = createMutation<
  WorkoutPlan,
  StoreWorkoutPlanData,
  AxiosError<ServerError<StoreWorkoutPlanData>>
>({
  mutationFn: async (data: StoreWorkoutPlanData): Promise<WorkoutPlan> => {
    const res = await api.post<WorkoutPlan>("/api/workout-plans", data);

    return res.data;
  },
});

export const useActivateWorkoutPlanMutation = createMutation<
  WorkoutPlan,
  { id: number },
  AxiosError<ServerError<{ id: number }>>
>({
  mutationFn: async (data: { id: number }): Promise<WorkoutPlan> => {
    const res = await api.patch<WorkoutPlan>(
      `/api/workout-plans/${data.id}/activate`
    );

    return res.data;
  },
});

export const useDeactivateWorkoutPlanMutation = createMutation<
  WorkoutPlan,
  { id: number }
>({
  mutationFn: async (data: { id: number }): Promise<WorkoutPlan> => {
    const res = await api.patch<WorkoutPlan>(
      `/api/workout-plans/${data.id}/deactivate`
    );

    return res.data;
  },
});

export const useGenerateWorkoutPlanMutation = createMutation<
  WorkoutPlan,
  { id: number },
  AxiosError<ServerError<{ id: number }>>
>({
  mutationFn: async (data: { id: number }): Promise<WorkoutPlan> => {
    const res = await api.patch<WorkoutPlan>(
      `/api/workout-plans/${data.id}/generate`
    );

    return res.data;
  },
});
