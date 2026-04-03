import { supabase } from "@/lib/supabase";
import { ExperienceLevel, Goal, Place, Plan, PlanData } from "@/lib/models";
import { createMutation, createQuery } from "react-query-kit";
import { segmentClient } from "~/lib/segment";
import { IS_E2E } from "~/lib/constants";

const PLAN_SELECT = `
  *,
  workouts (
    *,
    sessions:workout_sessions (*),
    exercises:workout_exercises (
      *,
      exercise:exercises (*),
      sets:workout_exercise_sets (*)
    )
  )
`;

export const usePlansQuery = createQuery<Plan[]>({
  queryKey: ["plans"],
  fetcher: async (): Promise<Plan[]> => {
    const { data, error } = await supabase
      .from("plans")
      .select(PLAN_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as Plan[];
  },
});

export type PlanQueryVariables = {
  id: string;
};

export const usePlanQuery = createQuery<Plan, PlanQueryVariables>({
  queryKey: ["plan"],
  fetcher: async ({ id }: PlanQueryVariables): Promise<Plan> => {
    const { data, error } = await supabase
      .from("plans")
      .select(PLAN_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as unknown as Plan;
  },
});

export const useStorePlanMutation = createMutation<Plan, PlanData>({
  mutationFn: async (planData: PlanData): Promise<Plan> => {
    // Strip nested exercise objects — only exercise_id is needed by the RPC
    const payload = {
      ...planData,
      workouts: planData.workouts.map((w) => ({
        ...w,
        exercises: w.exercises.map(({ exercise: _exercise, ...ex }) => ex),
      })),
    };

    const { data: planId, error: rpcError } = await supabase.rpc(
      "create_plan",
      {
        p_plan_data: payload,
      },
    );
    if (rpcError) throw rpcError;

    const { data: plan, error } = await supabase
      .from("plans")
      .select()
      .eq("id", planId)
      .single();
    if (error) throw error;

    if (!IS_E2E) segmentClient.track("Plan Saved", { plan_id: plan.id });
    return plan as unknown as Plan;
  },
});

export const useActivatePlanMutation = createMutation<Plan, { id: string }>({
  mutationFn: async (data: { id: string }): Promise<Plan> => {
    const { data: plan, error } = await supabase.rpc("activate_plan", {
      plan_id: data.id,
    });
    if (error) throw error;
    if (!IS_E2E) segmentClient.track("Plan Activated", { plan_id: data.id });
    return plan as unknown as Plan;
  },
});

export const useDeletePlanMutation = createMutation<void, { id: string }>({
  mutationFn: async (data: { id: string }): Promise<void> => {
    const { error } = await supabase
      .from("plans")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    if (!IS_E2E) segmentClient.track("Plan Deleted", { plan_id: data.id });
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
  queryKey: ["plan-preview"],
  fetcher: async (data: PreviewPlanData): Promise<PlanData> => {
    const { data: result, error } = await supabase.functions.invoke(
      "preview-plan",
      {
        body: data,
        headers: IS_E2E ? { "x-e2e": "true" } : undefined,
      },
    );
    if (error) throw error;
    return result as PlanData;
  },
});
