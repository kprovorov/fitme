import type { Plan, PlanInput } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

const PLAN_SELECT = `
  *,
  workouts (
    *,
    sessions:workout_sessions (*),
    exercises:workout_exercises (
      *,
      sets:workout_exercise_sets (*)
    )
  )
`;

export const usePlansQuery = createQuery<Plan[]>({
  fetcher: async (): Promise<Plan[]> => {
    const { data, error } = await supabase
      .from("plans")
      .select(PLAN_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      throw error;
    }
    return data as unknown as Plan[];
  },
  queryKey: ["plans"],
});

export interface PlanQueryVariables {
  id: string;
}

export const usePlanQuery = createQuery<Plan, PlanQueryVariables>({
  fetcher: async ({ id }: PlanQueryVariables): Promise<Plan> => {
    const { data, error } = await supabase
      .from("plans")
      .select(PLAN_SELECT)
      .eq("id", id)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as Plan;
  },
  queryKey: ["plan"],
});

export const useStorePlanMutation = createMutation<Plan, PlanInput>({
  mutationFn: async (planData: PlanInput): Promise<Plan> => {
    const { data: planId, error: rpcError } = await supabase.rpc(
      "create_plan",
      {
        p_plan_data: planData,
      }
    );
    if (rpcError) {
      throw rpcError;
    }

    const { data: plan, error } = await supabase
      .from("plans")
      .select()
      .eq("id", planId)
      .single();
    if (error) {
      throw error;
    }

    if (!IS_E2E) {
      segmentClient.track("Plan Saved", { plan_id: plan.id });
    }
    return plan as unknown as Plan;
  },
});

export const useActivatePlanMutation = createMutation<Plan, { id: string }>({
  mutationFn: async (data: { id: string }): Promise<Plan> => {
    const { data: plan, error } = await supabase.rpc("activate_plan", {
      plan_id: data.id,
    });
    if (error) {
      throw error;
    }
    if (!IS_E2E) {
      segmentClient.track("Plan Activated", { plan_id: data.id });
    }
    return plan as unknown as Plan;
  },
});

export const useDeletePlanMutation = createMutation<void, { id: string }>({
  mutationFn: async (data: { id: string }): Promise<void> => {
    const { error } = await supabase
      .from("plans")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", data.id);
    if (error) {
      throw error;
    }
    if (!IS_E2E) {
      segmentClient.track("Plan Deleted", { plan_id: data.id });
    }
  },
});
