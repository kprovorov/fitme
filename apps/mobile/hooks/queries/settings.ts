import type { MeasurementSystem } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { publicApi } from "~/lib/public-api";

/**
 * Switches the User's measurement system through `PATCH /v1/profile`, which
 * converts every stored height and weight. Rejects with an `ApiError`.
 */
export const useUpdateMeasurementSystemMutation = createMutation<
  void,
  MeasurementSystem
>({
  mutationFn: async (measurementSystem: MeasurementSystem): Promise<void> => {
    await publicApi().PATCH("/v1/profile", {
      body: { measurement_system: measurementSystem },
    });
  },
});
