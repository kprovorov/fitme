import { supabase } from "@/lib/supabase";
import { createMutation, createQuery } from "react-query-kit";
import { WorkoutSessionExercise } from "~/lib/models";

const SESSION_EXERCISE_SELECT = `
  *,
  exercise:exercises (*),
  sets:workout_session_exercise_sets (*)
`;

export type WorkoutSessionExercisesVariables = {
  sessionId: string;
  exerciseId: string;
};

export type StoreWorkoutSessionExerciseData = {
  exercise_id: string;
};

export const useWorkoutSessionExerciseQuery = createQuery<
  WorkoutSessionExercise,
  WorkoutSessionExercisesVariables
>({
  queryKey: ["workout-session-exercise"],
  fetcher: async ({ exerciseId }: WorkoutSessionExercisesVariables) => {
    const { data, error } = await supabase
      .from("workout_session_exercises")
      .select(SESSION_EXERCISE_SELECT)
      .eq("id", exerciseId)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutSessionExercise;
  },
});

export type CreateWorkoutSessionExercisesVariables = {
  sessionId: string;
  data: StoreWorkoutSessionExerciseData;
};

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

    const nextOrder = ((existing?.[0] as any)?.order ?? 0) + 1;

    const { data, error } = await supabase
      .from("workout_session_exercises")
      .insert({ workout_session_id: sessionId, exercise_id, order: nextOrder })
      .select(SESSION_EXERCISE_SELECT)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutSessionExercise;
  },
});

export type DeleteWorkoutSessionExerciseVariables = {
  exerciseId: string;
};

export const useDeleteWorkoutSessionExerciseMutation = createMutation<
  void,
  DeleteWorkoutSessionExerciseVariables
>({
  mutationFn: async ({ exerciseId }: DeleteWorkoutSessionExerciseVariables) => {
    const { error } = await supabase
      .from("workout_session_exercises")
      .delete()
      .eq("id", exerciseId);
    if (error) throw error;
  },
});

export type ReplaceWorkoutSessionExerciseVariables = {
  exerciseId: string;
  data: {
    exercise_id?: string;
  };
};

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
    if (error) throw error;

    const { error: setsError } = await supabase
      .from("workout_session_exercise_sets")
      .update({ weight_recommended: 0, reps_recommended: 0 })
      .eq("workout_session_exercise_id", exerciseId);
    if (setsError) throw setsError;

    return result as unknown as WorkoutSessionExercise;
  },
});
