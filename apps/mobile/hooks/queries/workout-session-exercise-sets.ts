import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { ApiError } from "~/lib/api/client";
import { publicApi } from "~/lib/public-api";

export interface UpdateWorkoutSessionExerciseSetParams {
  setId: string;
}

export interface UpdateWorkoutSessionExerciseSetData {
  reps_completed: number;
  weight_completed: number;
}

export interface UpdateWorkoutSessionExerciseSetVariables {
  data: UpdateWorkoutSessionExerciseSetData;
  params: UpdateWorkoutSessionExerciseSetParams;
}

/** A saved set, as both saves answer it. */
export type SavedWorkoutSessionExerciseSet = Pick<
  WorkoutSessionExerciseSet,
  | "id"
  | "logged_at"
  | "order"
  | "reps_completed"
  | "reps_recommended"
  | "rest_recommended"
  | "weight_completed"
  | "weight_recommended"
>;

/**
 * Logs a set's reps and weight through `PATCH /v1/workout-session-sets/{id}`;
 * the API sets `logged_at`. Rejects with an `ApiError`.
 */
export const useUpdateWorkoutSessionExerciseSetMutation = createMutation<
  SavedWorkoutSessionExerciseSet,
  UpdateWorkoutSessionExerciseSetVariables
>({
  mutationFn: async ({
    data,
    params: { setId },
  }: UpdateWorkoutSessionExerciseSetVariables): Promise<SavedWorkoutSessionExerciseSet> => {
    const { data: logged } = await publicApi().PATCH(
      "/v1/workout-session-sets/{id}",
      {
        body: {
          reps_completed: data.reps_completed,
          weight_completed: data.weight_completed,
        },
        params: { path: { id: setId } },
      }
    );
    if (!logged) {
      throw new ApiError("Public API answered without the logged set");
    }
    return logged.data;
  },
});

export interface CreateWorkoutSessionExerciseSetParams {
  exerciseId: string;
}

export interface CreateWorkoutSessionExerciseSetData {
  reps_completed: number;
  weight_completed: number;
}

export interface CreateWorkoutSessionExerciseSetVariables {
  data: CreateWorkoutSessionExerciseSetData;
  params: CreateWorkoutSessionExerciseSetParams;
}

/**
 * Adds a set, logged with these reps and weight, after a Workout Session
 * Exercise's last one through `POST /v1/workout-session-exercises/{id}/sets`;
 * the API sets `logged_at` and `order`. Rejects with an `ApiError`.
 */
export const useCreateWorkoutSessionExerciseSetMutation = createMutation<
  SavedWorkoutSessionExerciseSet,
  CreateWorkoutSessionExerciseSetVariables
>({
  mutationFn: async ({
    data,
    params: { exerciseId },
  }: CreateWorkoutSessionExerciseSetVariables): Promise<SavedWorkoutSessionExerciseSet> => {
    const { data: added } = await publicApi().POST(
      "/v1/workout-session-exercises/{id}/sets",
      {
        body: {
          reps_completed: data.reps_completed,
          weight_completed: data.weight_completed,
        },
        params: { path: { id: exerciseId } },
      }
    );
    if (!added) {
      throw new ApiError("Public API answered without the added set");
    }
    return added.data;
  },
});
