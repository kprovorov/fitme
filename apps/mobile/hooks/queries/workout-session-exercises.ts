import type { WorkoutSessionExercise } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

const SESSION_EXERCISE_SELECT = `
  *,
  exercise:exercises (*),
  sets:workout_session_exercise_sets (*)
`;

export interface WorkoutSessionExercisesVariables {
  exerciseId: string;
  sessionId: string;
}

export interface StoreWorkoutSessionExerciseData {
  exercise_id: string;
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

export const useCreateWorkoutSessionExerciseMutation = createMutation<
  WorkoutSessionExercise,
  CreateWorkoutSessionExercisesVariables
>({
  mutationFn: async ({
    sessionId,
    data: { exercise_id },
  }: CreateWorkoutSessionExercisesVariables) => {
    // Get the next order value
    const { data: existing } = await supabase
      .from("workout_session_exercises")
      .select("order")
      .eq("workout_session_id", sessionId)
      .order("order", { ascending: false })
      .limit(1);

    const nextOrder = ((existing?.[0] as { order?: number })?.order ?? 0) + 1;

    const { data, error } = await supabase
      .from("workout_session_exercises")
      .insert({ exercise_id, order: nextOrder, workout_session_id: sessionId })
      .select(SESSION_EXERCISE_SELECT)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as WorkoutSessionExercise;
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
    exercise_id?: string;
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
