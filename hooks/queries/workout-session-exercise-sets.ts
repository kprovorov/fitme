import { createMutation } from "react-query-kit";
import { api } from "~/lib/api";
import { WorkoutSessionExerciseSet } from "~/lib/models";

export type UpdateWorkoutSessionExerciseSetParams = {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
  setId: number;
};

export type UpdateWorkoutSessionExerciseSetData = {
  weight_completed: number;
  reps_completed: number;
};

export type UpdateWorkoutSessionExerciseSetVariables = {
  data: UpdateWorkoutSessionExerciseSetData;
  params: UpdateWorkoutSessionExerciseSetParams;
};

export const useUpdateWorkoutSessionExerciseSetMutation = createMutation<
  WorkoutSessionExerciseSet,
  UpdateWorkoutSessionExerciseSetVariables
>({
  mutationFn: async ({
    data,
    params,
  }: {
    data: UpdateWorkoutSessionExerciseSetData;
    params: UpdateWorkoutSessionExerciseSetParams;
  }): Promise<WorkoutSessionExerciseSet> => {
    const response = await api.put<WorkoutSessionExerciseSet>(
      `/api/plans/${params.planId}/workouts/${params.workoutId}/sessions/${params.sessionId}/exercises/${params.exerciseId}/sets/${params.setId}`,
      data,
    );

    return response.data;
  },
});

export type CreateWorkoutSessionExerciseSetParams = {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
};

export type CreateWorkoutSessionExerciseSetData = {
  weight_completed: number;
  reps_completed: number;
};

export type CreateWorkoutSessionExerciseSetVariables = {
  data: CreateWorkoutSessionExerciseSetData;
  params: CreateWorkoutSessionExerciseSetParams;
};

export const useCreateWorkoutSessionExerciseSetMutation = createMutation<
  WorkoutSessionExerciseSet,
  CreateWorkoutSessionExerciseSetVariables
>({
  mutationFn: async ({
    data,
    params,
  }: {
    data: CreateWorkoutSessionExerciseSetData;
    params: CreateWorkoutSessionExerciseSetParams;
  }): Promise<WorkoutSessionExerciseSet> => {
    const response = await api.post<WorkoutSessionExerciseSet>(
      `/api/plans/${params.planId}/workouts/${params.workoutId}/sessions/${params.sessionId}/exercises/${params.exerciseId}/sets`,
      data,
    );

    return response.data;
  },
});
