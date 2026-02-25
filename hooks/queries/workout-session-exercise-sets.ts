import { supabase } from "@/lib/supabase";
import { createMutation } from "react-query-kit";
import { WorkoutSessionExerciseSet } from "~/lib/models";

export type UpdateWorkoutSessionExerciseSetParams = {
  setId: string;
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
    params: { setId },
  }: UpdateWorkoutSessionExerciseSetVariables): Promise<WorkoutSessionExerciseSet> => {
    const { data: result, error } = await supabase
      .from("workout_session_exercise_sets")
      .update({
        weight_completed: data.weight_completed,
        reps_completed: data.reps_completed,
        logged_at: new Date().toISOString(),
      })
      .eq("id", setId)
      .select()
      .single();
    if (error) throw error;
    return result as unknown as WorkoutSessionExerciseSet;
  },
});

export type CreateWorkoutSessionExerciseSetParams = {
  exerciseId: string;
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
    params: { exerciseId },
  }: CreateWorkoutSessionExerciseSetVariables): Promise<WorkoutSessionExerciseSet> => {
    // Get the next order value
    const { data: existing } = await supabase
      .from("workout_session_exercise_sets")
      .select("order")
      .eq("workout_session_exercise_id", exerciseId)
      .order("order", { ascending: false })
      .limit(1);

    const nextOrder = ((existing?.[0] as any)?.order ?? 0) + 1;

    const { data: result, error } = await supabase
      .from("workout_session_exercise_sets")
      .insert({
        workout_session_exercise_id: exerciseId,
        order: nextOrder,
        weight_completed: data.weight_completed,
        reps_completed: data.reps_completed,
        logged_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return result as unknown as WorkoutSessionExerciseSet;
  },
});
