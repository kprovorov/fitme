import { ApiError } from "@fitme/api-client";
import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { useMutationState } from "@tanstack/react-query";
import { createMutation } from "react-query-kit";

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
/** Logging a set, whichever screen's row runs it. */
const LOG_SET_MUTATION_KEY = ["workout-session-set", "log"];

/** Logging an added set, which creates it, whichever screen's row runs it. */
const ADD_SET_MUTATION_KEY = ["workout-session-set", "add"];

export const useUpdateWorkoutSessionExerciseSetMutation = createMutation<
  SavedWorkoutSessionExerciseSet,
  UpdateWorkoutSessionExerciseSetVariables
>({
  mutationKey: LOG_SET_MUTATION_KEY,
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
  mutationKey: ADD_SET_MUTATION_KEY,
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

export interface DeleteWorkoutSessionSetVariables {
  setId: string;
}

/**
 * Removes a set from an open Workout Session through
 * `DELETE /v1/workout-session-sets/{id}`, which answers 204 for a set that's
 * already gone too. Rejects with an `ApiError`.
 */
export const useDeleteWorkoutSessionSetMutation = createMutation({
  mutationFn: async ({ setId }: DeleteWorkoutSessionSetVariables) => {
    await publicApi().DELETE("/v1/workout-session-sets/{id}", {
      params: { path: { id: setId } },
    });
  },
});

/**
 * Whether a save of this set runs, from any screen: the Workout Session
 * screen and the Workout Session Exercise screen each have their own row for
 * it. `setId` is `null` for an added set not saved yet, whose save is any
 * set added to its Workout Session Exercise.
 */
export const useIsSavingSet = (
  setId: string | null,
  exerciseId: string
): boolean => {
  // Each pending save's set (a log) or Workout Session Exercise (an add).
  const logged = useMutationState({
    filters: { mutationKey: LOG_SET_MUTATION_KEY, status: "pending" },
    select: ({ state }) =>
      // SAFETY: only `useUpdateWorkoutSessionExerciseSetMutation` runs under
      // this key, and it takes these variables.
      (state.variables as UpdateWorkoutSessionExerciseSetVariables | undefined)
        ?.params.setId,
  });

  const added = useMutationState({
    filters: { mutationKey: ADD_SET_MUTATION_KEY, status: "pending" },
    select: ({ state }) =>
      // SAFETY: only `useCreateWorkoutSessionExerciseSetMutation` runs under
      // this key, and it takes these variables.
      (state.variables as CreateWorkoutSessionExerciseSetVariables | undefined)
        ?.params.exerciseId,
  });

  return setId === null ? added.includes(exerciseId) : logged.includes(setId);
};
