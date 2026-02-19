import { supabase } from "@/lib/supabase";
import { ExperienceLevel, Goal, Place, Plan, PlanData } from "@/lib/models";
import { createMutation, createQuery } from "react-query-kit";

const PLAN_SELECT = `
  *,
  workouts (
    *,
    workout_exercises (
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
  id: number;
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

type StorePlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
  experience_level: ExperienceLevel;
  workout_duration: number;
  note?: string;
};

export const useStorePlanMutation = createMutation<Plan, StorePlanData>({
  mutationFn: async (data: StorePlanData): Promise<Plan> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: plan, error } = await supabase
      .from("plans")
      .insert({ ...data, user_id: user!.id })
      .select()
      .single();
    if (error) throw error;
    return plan as unknown as Plan;
  },
});

export const useActivatePlanMutation = createMutation<Plan, { id: number }>({
  mutationFn: async (data: { id: number }): Promise<Plan> => {
    const { data: plan, error } = await supabase.rpc("activate_plan", {
      plan_id: data.id,
    });
    if (error) throw error;
    return plan as unknown as Plan;
  },
});

export const useDeletePlanMutation = createMutation<void, { id: number }>({
  mutationFn: async (data: { id: number }): Promise<void> => {
    const { error } = await supabase
      .from("plans")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
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
      { body: data },
    );
    if (error) throw error;
    return result as PlanData;
  },
});
