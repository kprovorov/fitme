import { api, ServerError } from "@/lib/api";
import { ExperienceLevel, Goal, Place, Plan, PlanData } from "@/lib/models";
import { AxiosError } from "axios";
import { createMutation, createQuery } from "react-query-kit";

export const usePlansQuery = createQuery<Plan[]>({
  queryKey: ["plans"],
  fetcher: async (): Promise<Plan[]> => {
    const res = await api.get<Plan[]>("/api/plans");

    return res.data;
  },
});

export type PlanQueryVariables = {
  id: number;
};

export const usePlanQuery = createQuery<Plan, PlanQueryVariables>({
  queryKey: ["plan"],
  fetcher: async ({ id }: PlanQueryVariables): Promise<Plan> => {
    const res = await api.get<Plan>(`/api/plans/${id}`);

    return res.data;
  },
});

type StorePlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
};

export const useStorePlanMutation = createMutation<
  Plan,
  StorePlanData,
  AxiosError<ServerError<StorePlanData>>
>({
  mutationFn: async (data: StorePlanData): Promise<Plan> => {
    const res = await api.post<Plan>("/api/plans", data);

    return res.data;
  },
});

export const useActivatePlanMutation = createMutation<
  Plan,
  { id: number },
  AxiosError<ServerError<{ id: number }>>
>({
  mutationFn: async (data: { id: number }): Promise<Plan> => {
    const res = await api.patch<Plan>(`/api/plans/${data.id}/activate`);

    return res.data;
  },
});

export const useDeletePlanMutation = createMutation<
  void,
  { id: number },
  AxiosError<ServerError<{ id: number }>>
>({
  mutationFn: async (data: { id: number }): Promise<void> => {
    const res = await api.delete<void>(`/api/plans/${data.id}`);

    return res.data;
  },
});

type PreviewPlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
};

export const usePreviewPlanQuery = createQuery<PlanData, PreviewPlanData>({
  queryKey: ["previewPlan"],
  fetcher: async (data: PreviewPlanData): Promise<PlanData> => {
    const res = await api.post<PlanData>("/api/plans/preview", data);

    return res.data;
  },
});
