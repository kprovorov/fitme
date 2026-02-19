import { supabase } from "@/lib/supabase";
import { createMutation } from "react-query-kit";
import { MeasurementSystem } from "~/lib/models";

export const useUpdateMeasurementSystemMutation = createMutation<
  void,
  MeasurementSystem
>({
  mutationFn: async (measurementSystem: MeasurementSystem): Promise<void> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Fetch the latest profile id for this user
    const { data: latest, error: fetchError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from("profiles")
      .update({ measurement_system: measurementSystem })
      .eq("id", latest.id);
    if (error) throw error;
  },
});
