import type { WorkoutSessionExercise } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { publicApi } from "~/lib/public-api";

const SESSION_EXERCISE_SELECT = `
  *,
  sets:workout_session_exercise_sets (*)
`;

export interface WorkoutSessionExercisesVariables {
  exerciseId: string;
  sessionId: string;
}

export interface StoreWorkoutSessionExerciseData {
  exercise_slug: string;
}

export const useWorkoutSessionExerciseQuery = createQuery<
  WorkoutSessionExercise,
  WorkoutSessionExercisesVariables
>({
  fetcher: async ({ exerciseId }: WorkoutSessionExercisesVariables) => {
    const { data, error } = await supabase
      .from("workout_session_exercises")
      .select(SESSION_EXERCISE_SELECT)
      .eq("id", exerciseId)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as WorkoutSessionExercise;
  },
  queryKey: ["workout-session-exercise"],
});

export interface CreateWorkoutSessionExercisesVariables {
  data: StoreWorkoutSessionExerciseData;
  sessionId: string;
}

/**
 * Appends an Exercise to an open Workout Session through
 * `POST /v1/workout-sessions/{id}/exercises`, which checks its slug against the
 * Library; the screen re-reads the session. Rejects with an
 * `ApiError`.
 */
export const useCreateWorkoutSessionExerciseMutation = createMutation<
  void,
  CreateWorkoutSessionExercisesVariables
>({
  mutationFn: async ({
    sessionId,
    data: { exercise_slug },
  }: CreateWorkoutSessionExercisesVariables) => {
    await publicApi().POST("/v1/workout-sessions/{id}/exercises", {
      body: { exercise_slug },
      params: { path: { id: sessionId } },
    });
  },
});

export interface DeleteWorkoutSessionExerciseVariables {
  exerciseId: string;
}

/**
 * Removes an Exercise, with its sets, from an open Workout Session through
 * `DELETE /v1/workout-session-exercises/{id}`, leaving the others' `order`; the
 * screen re-reads the session. Rejects with an `ApiError`.
 */
export const useDeleteWorkoutSessionExerciseMutation = createMutation<
  void,
  DeleteWorkoutSessionExerciseVariables
>({
  mutationFn: async ({ exerciseId }: DeleteWorkoutSessionExerciseVariables) => {
    await publicApi().DELETE("/v1/workout-session-exercises/{id}", {
      params: { path: { id: exerciseId } },
    });
  },
});

export interface ReplaceWorkoutSessionExerciseVariables {
  data: {
    exercise_slug: string;
  };
  exerciseId: string;
}

/**
 * Replaces an open Workout Session's Exercise through
 * `PUT /v1/workout-session-exercises/{id}`, which checks its slug against the
 * Library and zeroes its sets' targets in the same transaction; the
 * screen re-reads the session. Rejects with an `ApiError`.
 */
export const useReplaceWorkoutSessionExerciseMutation = createMutation<
  void,
  ReplaceWorkoutSessionExerciseVariables
>({
  mutationFn: async ({
    exerciseId,
    data: { exercise_slug },
  }: ReplaceWorkoutSessionExerciseVariables) => {
    await publicApi().PUT("/v1/workout-session-exercises/{id}", {
      body: { exercise_slug },
      params: { path: { id: exerciseId } },
    });
  },
});
