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
 * Exercise Library; the screen re-reads the session. Rejects with an
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

export const useDeleteWorkoutSessionExerciseMutation = createMutation<
  void,
  DeleteWorkoutSessionExerciseVariables
>({
  mutationFn: async ({ exerciseId }: DeleteWorkoutSessionExerciseVariables) => {
    const { error } = await supabase
      .from("workout_session_exercises")
      .delete()
      .eq("id", exerciseId);
    if (error) {
      throw error;
    }
  },
});

export interface ReplaceWorkoutSessionExerciseVariables {
  data: {
    exercise_slug: string;
  };
  exerciseId: string;
}

export const useReplaceWorkoutSessionExerciseMutation = createMutation<
  WorkoutSessionExercise,
  ReplaceWorkoutSessionExerciseVariables
>({
  mutationFn: async ({
    exerciseId,
    data,
  }: ReplaceWorkoutSessionExerciseVariables) => {
    const { data: result, error } = await supabase
      .from("workout_session_exercises")
      .update(data)
      .eq("id", exerciseId)
      .select(SESSION_EXERCISE_SELECT)
      .single();
    if (error) {
      throw error;
    }

    const { error: setsError } = await supabase
      .from("workout_session_exercise_sets")
      .update({ reps_recommended: 0, weight_recommended: 0 })
      .eq("workout_session_exercise_id", exerciseId);
    if (setsError) {
      throw setsError;
    }

    return result as unknown as WorkoutSessionExercise;
  },
});
