import { createMutation } from "react-query-kit";
import { api } from "~/lib/api";
import { WorkoutExerciseSet } from "~/lib/models";

type UpdateWorkoutExerciseSetData = {
  id: number;
  weight_done: number;
  repeats_done: number;
};

export const useUpdateWorkoutExerciseSetMutation = createMutation<
  WorkoutExerciseSet,
  UpdateWorkoutExerciseSetData
>({
  mutationFn: async (
    data: UpdateWorkoutExerciseSetData,
  ): Promise<WorkoutExerciseSet> => {
    const response = await api.put<WorkoutExerciseSet>(
      `/api/workout-exercise-sets/${data.id}`,
      data,
    );

    return response.data;
  },
});
