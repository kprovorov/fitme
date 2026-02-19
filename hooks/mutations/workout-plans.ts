import { supabase } from "@/lib/supabase";
import { createMutation } from "react-query-kit";
import { Goal, Place, Plan } from "~/lib/models";

type StoreWorkoutPlanData = {
  goal: Goal;
  place: Place;
  frequency: number;
};

export const useStoreWorkoutPlanMutation = createMutation<
  Plan,
  StoreWorkoutPlanData
>({
  mutationFn: async (data: StoreWorkoutPlanData): Promise<Plan> => {
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

export const useGenerateWorkoutPlanMutation = createMutation<
  Plan,
  { id: number }
>({
  mutationFn: async (data: { id: number }): Promise<Plan> => {
    const { data: result, error } = await supabase.functions.invoke(
      "generate-plan",
      { body: { id: data.id } },
    );
    if (error) throw error;
    return result as Plan;
  },
});
