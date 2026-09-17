import type { MeasurementSystem } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";

export const useUpdateMeasurementSystemMutation = createMutation<
  void,
  MeasurementSystem
>({
  mutationFn: async (measurementSystem: MeasurementSystem): Promise<void> => {
    const { error } = await supabase.rpc("convert_measurement_system", {
      p_new_system: measurementSystem,
    });
    if (error) {
      throw error;
    }
  },
});
