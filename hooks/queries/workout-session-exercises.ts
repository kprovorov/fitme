import { api } from "~/lib/api";
import { createMutation, createQuery } from "react-query-kit";
import { WorkoutSessionExercise } from "~/lib/models";

export type WorkoutSessionExercisesVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
};

export type StoreWorkoutSessionExerciseData = {
  exercise_id: number;
};

export const useWorkoutSessionExerciseQuery = createQuery<
  WorkoutSessionExercise,
  WorkoutSessionExercisesVariables
>({
  queryKey: ["workout-session-exercise"],
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

export type CreateWorkoutSessionExercisesVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
  data: StoreWorkoutSessionExerciseData;
};

export const useCreateWorkoutSessionExerciseMutation = createMutation<
  WorkoutSessionExercise,
  CreateWorkoutSessionExercisesVariables
>({
  mutationFn: async ({
    planId,
    workoutId,
    sessionId,
    data,
  }: CreateWorkoutSessionExercisesVariables) => {
    const response = await api.post(
      `/api/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises`,
      data,
    );

    return response.data;
  },
});

export type DeleteWorkoutSessionExerciseVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
};

export const useDeleteWorkoutSessionExerciseMutation = createMutation<
  void,
  DeleteWorkoutSessionExerciseVariables
>({
  mutationFn: async ({
    planId,
    workoutId,
    sessionId,
    exerciseId,
  }: DeleteWorkoutSessionExerciseVariables) => {
    await api.delete(
      `/api/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${exerciseId}`,
    );
  },
});

export type ReplaceWorkoutSessionExerciseVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
  exerciseId: number;
  data: {
    exercise_id?: number;
  };
};

export const useReplaceWorkoutSessionExerciseMutation = createMutation<
  WorkoutSessionExercise,
  ReplaceWorkoutSessionExerciseVariables
>({
  mutationFn: async ({
    planId,
    workoutId,
    sessionId,
    exerciseId,
    data,
  }: ReplaceWorkoutSessionExerciseVariables) => {
    const response = await api.patch(
      `/api/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${exerciseId}`,
      data,
    );
    return response.data;
  },
});
