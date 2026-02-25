import { supabase } from "@/lib/supabase";
import { createMutation, createQuery } from "react-query-kit";
import { WorkoutExercise, WorkoutSession } from "~/lib/models";

const SESSION_SELECT = `
  *,
  workout:workouts (
    *,
    plan:plans (*)
  ),
  exercises:workout_session_exercises (
    *,
    exercise:exercises (*),
    sets:workout_session_exercise_sets (*)
  )
`;

export type CreateWorkoutSessionVariables = {
  workoutId: number;
  exercises: WorkoutExercise[];
};

export const useCreateWorkoutSessionMutation = createMutation<
  WorkoutSession,
  CreateWorkoutSessionVariables
>({
  mutationFn: async ({
    workoutId,
    exercises,
  }: CreateWorkoutSessionVariables): Promise<WorkoutSession> => {
    const { data: session, error: sessionError } = await supabase
      .from("workout_sessions")
      .insert({
        workout_id: workoutId,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    await Promise.all(
      exercises.map(async (exercise) => {
        const { data: sessionExercise, error: exerciseError } = await supabase
          .from("workout_session_exercises")
          .insert({
            workout_session_id: session.id,
            exercise_id: exercise.exercise_id,
            order: exercise.order,
          })
          .select("id")
          .single();
        if (exerciseError) throw exerciseError;

        if (exercise.sets.length > 0) {
          const { error: setsError } = await supabase
            .from("workout_session_exercise_sets")
            .insert(
              exercise.sets.map((set) => ({
                workout_session_exercise_id: sessionExercise.id,
                order: set.order,
                reps_recommended: set.reps_recommended,
                weight_recommended: set.weight_recommended,
                rest_recommended: set.rest_recommended,
              })),
            );
          if (setsError) throw setsError;
        }
      }),
    );

    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .eq("id", session.id)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutSession;
  },
});

export type GetWorkoutSessionVariables = {
  sessionId: number;
};

export const useWorkoutSessionQuery = createQuery<
  WorkoutSession,
  GetWorkoutSessionVariables
>({
  queryKey: ["workout-session"],
  fetcher: async ({ sessionId }: GetWorkoutSessionVariables) => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutSession;
  },
});

export type FinishWorkoutSessionVariables = {
  sessionId: number;
};

export const useFinishWorkoutSessionMutation = createMutation<
  WorkoutSession,
  FinishWorkoutSessionVariables
>({
  mutationFn: async ({ sessionId }: FinishWorkoutSessionVariables) => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select(SESSION_SELECT)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutSession;
  },
});

export const useWorkoutSessionHistoryQuery = createQuery<
  WorkoutSession[],
  void
>({
  queryKey: ["workout-sessions-history"],
  fetcher: async () => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as WorkoutSession[];
  },
});
