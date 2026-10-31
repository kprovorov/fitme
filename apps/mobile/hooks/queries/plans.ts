import type { Plan } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
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
 * `Plan Activated` once it has, and refetches the Plan lists. Answers the new Plan's id; rejects with an
 * `ApiError` (`unknown_exercises`, `library_unavailable`, …).
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
  // On the mutation, not the call: it still runs once the card is gone.
  onSuccess: async (_id, _plan, _result, { client }) => {
    await client.invalidateQueries({ queryKey: ["plans"] });
    // The new active Plan's frequency is the Weekly goal
    await client.invalidateQueries({ queryKey: WEEKLY_GOALS_QUERY_KEY });
  },
});

/**
 * Makes the Plan the User's active one through
 * `POST /v1/plans/{id}/activate`; every other Plan of theirs goes inactive.
 * Rejects with an `ApiError`.
 */
export const useActivatePlanMutation = createMutation<void, { id: string }>({
  mutationFn: async ({ id }: { id: string }): Promise<void> => {
    await publicApi().POST("/v1/plans/{id}/activate", {
      params: { path: { id } },
    });
    if (!IS_E2E) {
      segmentClient.track("Plan Activated", { plan_id: id });
    }
  },
});

/**
 * Soft-deletes the Plan through `DELETE /v1/plans/{id}` (its Workout Sessions
 * stay); a Plan already deleted succeeds again. Rejects with an `ApiError`.
 */
export const useDeletePlanMutation = createMutation<void, { id: string }>({
  mutationFn: async ({ id }: { id: string }): Promise<void> => {
    await publicApi().DELETE("/v1/plans/{id}", { params: { path: { id } } });
    if (!IS_E2E) {
      segmentClient.track("Plan Deleted", { plan_id: id });
    }
  },
});
