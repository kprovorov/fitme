import { AxiosError } from "axios";
import { createMutation, createQuery } from "react-query-kit";
import { api, ServerError } from "~/lib/api";
import { WorkoutSession } from "~/lib/models";

export type CreateWorkoutSessionVariables = {
  planId: number;
  planWorkoutId: number;
};

export const useCreateWorkoutSessionMutation = createMutation<
  WorkoutSession,
  CreateWorkoutSessionVariables
>({
  mutationFn: async ({
    planId,
    planWorkoutId,
  }: CreateWorkoutSessionVariables): Promise<WorkoutSession> => {
    const res = await api.post<WorkoutSession>(
      `/api/plans/${planId}/workouts/${planWorkoutId}/sessions`,
    );
    return res.data;
  },
});

export type GetWorkoutSessionVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
};

export const useWorkoutSessionQuery = createQuery<
  WorkoutSession,
  GetWorkoutSessionVariables
>({
  queryKey: ["workout-session"],
  fetcher: async ({
    planId,
    workoutId,
    sessionId,
  }: GetWorkoutSessionVariables) => {
    const res = await api.get<WorkoutSession>(
      `/api/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}`,
    );
    return res.data;
  },
});

export type FinishWorkoutSessionVariables = {
  planId: number;
  workoutId: number;
  sessionId: number;
};

export const useFinishWorkoutSessionMutation = createMutation<
  WorkoutSession,
  FinishWorkoutSessionVariables,
  AxiosError<ServerError<FinishWorkoutSessionVariables>>
>({
  mutationFn: async ({
    planId,
    workoutId,
    sessionId,
  }: FinishWorkoutSessionVariables) => {
    const res = await api.patch<WorkoutSession>(
      `/api/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/finish`,
    );
    return res.data;
  },
});
