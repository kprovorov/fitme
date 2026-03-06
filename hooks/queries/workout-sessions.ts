import { supabase } from "@/lib/supabase";
import { createMutation, createQuery } from "react-query-kit";
import { WorkoutSession } from "~/lib/models";

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
  workoutId: string;
};

export const useCreateWorkoutSessionMutation = createMutation<
  WorkoutSession,
  CreateWorkoutSessionVariables
>({
  mutationFn: async ({
    workoutId,
  }: CreateWorkoutSessionVariables): Promise<WorkoutSession> => {
    const { data: sessionId, error: rpcError } = await supabase.rpc(
      "start_workout_session",
      { p_workout_id: workoutId },
    );
    if (rpcError) throw rpcError;

    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
      .single();
    if (error) throw error;
    return data as unknown as WorkoutSession;
  },
});

export type GetWorkoutSessionVariables = {
  sessionId: string;
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
  sessionId: string;
};

export const useFinishWorkoutSessionMutation = createMutation<
  WorkoutSession,
  FinishWorkoutSessionVariables
>({
  mutationFn: async ({ sessionId }: FinishWorkoutSessionVariables) => {
    const { error: rpcError } = await supabase.rpc("finish_workout_session", {
      p_session_id: sessionId,
    });
    if (rpcError) throw rpcError;

    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
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
