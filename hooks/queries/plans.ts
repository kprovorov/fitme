import { api, ServerError } from "@/lib/api";
import { Goal, Place, Plan } from "@/lib/models";
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
