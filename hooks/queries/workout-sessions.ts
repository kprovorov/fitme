import { createMutation } from "react-query-kit";
import { api } from "~/lib/api";
import { WorkoutSession } from "~/lib/models";

export type WorkoutSessionCreateVariables = {
  planId: number;
  planWorkoutId: number;
};

export const useCreateWorkoutSessionMutation = createMutation<
  WorkoutSession,
  WorkoutSessionCreateVariables
>({
  mutationFn: async (
    variables: WorkoutSessionCreateVariables
  ): Promise<WorkoutSession> => {
    const res = await api.post<WorkoutSession>(
      `/api/plans/${variables.planId}/workouts/${variables.planWorkoutId}/sessions`
    );
    return res.data;
  },
});
