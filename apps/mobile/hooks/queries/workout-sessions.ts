import type { WorkoutSession } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";

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

export interface CreateWorkoutSessionVariables {
  workoutId: string;
}

export const useCreateWorkoutSessionMutation = createMutation<
  WorkoutSession,
  CreateWorkoutSessionVariables
>({
  mutationFn: async ({
    workoutId,
  }: CreateWorkoutSessionVariables): Promise<WorkoutSession> => {
    const { data: sessionId, error: rpcError } = await supabase.rpc(
      "start_workout_session",
      { p_workout_id: workoutId }
    );
    if (rpcError) {
      throw rpcError;
    }

    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as WorkoutSession;
  },
});

export interface GetWorkoutSessionVariables {
  sessionId: string;
}

export const fetchWorkoutSession = async (
  sessionId: string
): Promise<WorkoutSession> => {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .single();
  if (error) {
    throw error;
  }
  return data as unknown as WorkoutSession;
};

export const useWorkoutSessionQuery = createQuery<
  WorkoutSession,
  GetWorkoutSessionVariables
>({
  fetcher: ({ sessionId }: GetWorkoutSessionVariables) =>
    fetchWorkoutSession(sessionId),
  queryKey: ["workout-session"],
});

export interface FinishWorkoutSessionVariables {
  sessionId: string;
}

export const useFinishWorkoutSessionMutation = createMutation<
  WorkoutSession,
  FinishWorkoutSessionVariables
>({
  mutationFn: async ({ sessionId }: FinishWorkoutSessionVariables) => {
    const { error: rpcError } = await supabase.rpc("finish_workout_session", {
      p_session_id: sessionId,
    });
    if (rpcError) {
      throw rpcError;
    }

    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .eq("id", sessionId)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as WorkoutSession;
  },
});

export const useWorkoutSessionHistoryQuery = createQuery<
  WorkoutSession[],
  void
>({
  fetcher: async () => {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as WorkoutSession[];
  },
  queryKey: ["workout-sessions-history"],
});
