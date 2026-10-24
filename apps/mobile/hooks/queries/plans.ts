import type { Plan } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { ApiError } from "~/lib/api/client";
import { IS_E2E } from "~/lib/constants";
import type { NewPlan } from "~/lib/plan-card";
import { publicApi } from "~/lib/public-api";
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

/**
 * Saves a Plan through `POST /v1/plans` and makes it the active one, in one
 * transaction: nothing is saved unless all of it is. Fires `Plan Saved` and
 * `Plan Activated` once it has. Answers the new Plan's id; rejects with an
 * `ApiError` (`unknown_exercises`, `exercise_library_unavailable`, …).
 */
export const useCreatePlanMutation = createMutation<string, NewPlan>({
  mutationFn: async (plan: NewPlan): Promise<string> => {
    const { data } = await publicApi().POST("/v1/plans", {
      body: { ...plan, activate: true },
    });
    if (!data) {
      throw new ApiError("Public API answered no Plan");
    }
    const { id } = data.data;
    if (!IS_E2E) {
      segmentClient.track("Plan Saved", { plan_id: id });
      segmentClient.track("Plan Activated", { plan_id: id });
    }
    return id;
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
