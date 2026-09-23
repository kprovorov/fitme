import type { WorkoutSessionExerciseSet } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";

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

export const useUpdateWorkoutSessionExerciseSetMutation = createMutation<
  WorkoutSessionExerciseSet,
  UpdateWorkoutSessionExerciseSetVariables
>({
  mutationFn: async ({
    data,
    params: { setId },
  }: UpdateWorkoutSessionExerciseSetVariables): Promise<WorkoutSessionExerciseSet> => {
    const { data: result, error } = await supabase
      .from("workout_session_exercise_sets")
      .update({
        logged_at: new Date().toISOString(),
        reps_completed: data.reps_completed,
        weight_completed: data.weight_completed,
      })
      .eq("id", setId)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return result as unknown as WorkoutSessionExerciseSet;
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

    const nextOrder = ((existing?.[0] as { order?: number })?.order ?? 0) + 1;

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
