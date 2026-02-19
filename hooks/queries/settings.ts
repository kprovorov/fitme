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
    const { error } = await supabase
      .from("profiles")
      .update({ measurement_system: measurementSystem })
      .eq("user_id", user!.id);
    if (error) throw error;
  },
});
