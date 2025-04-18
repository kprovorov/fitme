import { api } from "@/lib/api";
import { Plan } from "@/lib/models";
import { createQuery } from "react-query-kit";

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
