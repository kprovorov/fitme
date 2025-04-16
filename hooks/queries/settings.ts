import { AxiosError } from "axios";
import { createMutation } from "react-query-kit";
import { api, ServerError } from "~/lib/api";
import { MeasurementSystem } from "~/lib/models";

export const useUpdateMeasurementSystemMutation = createMutation<
  void,
  MeasurementSystem,
  AxiosError<ServerError<MeasurementSystem>>
>({
  mutationFn: async (measurementSystem: MeasurementSystem): Promise<void> => {
    await api.patch<void>("/api/settings/measurement-system", {
      measurement_system: measurementSystem,
    });
  },
});
