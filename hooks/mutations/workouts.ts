import { createMutation } from "react-query-kit";
import { api } from "~/lib/api";
import { PlanWorkout } from "~/lib/models";

export const useStartWorkoutMutation = createMutation<PlanWorkout, number>({
  mutationFn: async (workoutId: number): Promise<PlanWorkout> => {
    const res = await api.patch<PlanWorkout>(
      `/api/workouts/${workoutId}/start`
    );

    return res.data;
  },
});

export const useFinishWorkoutMutation = createMutation<PlanWorkout, number>({
  mutationFn: async (workoutId: number): Promise<PlanWorkout> => {
    const res = await api.patch<PlanWorkout>(
      `/api/workouts/${workoutId}/finish`
    );

    return res.data;
  },
});
