import { api } from "~/lib/api";
import { createQuery } from "react-query-kit";
import { WorkoutSessionExercise } from "~/lib/models";

export type WorkoutSessionExercisesVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
};

export const useWorkoutSessionExerciseQuery = createQuery<
  WorkoutSessionExercise,
  WorkoutSessionExercisesVariables
>({
  queryKey: ["workoutSessionExercise"],
  fetcher: async ({
    planId,
    workoutId,
    sessionId,
    exerciseId,
  }: WorkoutSessionExercisesVariables) => {
    const response = await api.get(
      `/api/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${exerciseId}`,
    );
    return response.data;
  },
});
