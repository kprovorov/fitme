import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
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

export const useCreateWorkoutSessionExerciseSetMutation = createMutation<
  WorkoutSessionExerciseSet,
  CreateWorkoutSessionExerciseSetVariables
>({
  mutationFn: async ({
    data,
    params: { exerciseId },
  }: CreateWorkoutSessionExerciseSetVariables): Promise<WorkoutSessionExerciseSet> => {
    // Get the next order value
    const { data: existing } = await supabase
      .from("workout_session_exercise_sets")
      .select("order")
      .eq("workout_session_exercise_id", exerciseId)
      .order("order", { ascending: false })
      .limit(1);

    const nextOrder =
      ((existing?.[0] as { order?: number } | undefined)?.order ?? 0) + 1;

    const { data: result, error } = await supabase
      .from("workout_session_exercise_sets")
      .insert({
        logged_at: new Date().toISOString(),
        order: nextOrder,
        reps_completed: data.reps_completed,
        weight_completed: data.weight_completed,
        workout_session_exercise_id: exerciseId,
      })
      .select()
      .single();
    if (error) {
      throw error;
    }
    return result as unknown as WorkoutSessionExerciseSet;
  },
});
