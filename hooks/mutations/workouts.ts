import { createMutation } from "react-query-kit";
import { api } from "~/lib/api";
import { Workout } from "~/lib/models";

export const useStartWorkoutMutation = createMutation<Workout, number>({
  mutationFn: async (workoutId: number): Promise<Workout> => {
    const res = await api.patch<Workout>(`/api/workouts/${workoutId}/start`);

    return res.data;
  },
});

export const useFinishWorkoutMutation = createMutation<Workout, number>({
  mutationFn: async (workoutId: number): Promise<Workout> => {
    const res = await api.patch<Workout>(`/api/workouts/${workoutId}/finish`);

    return res.data;
  },
});
