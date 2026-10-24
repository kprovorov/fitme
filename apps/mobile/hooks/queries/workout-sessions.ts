import type { PlanChanges, WorkoutSession } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { ApiError } from "~/lib/api/client";
import { publicApi } from "~/lib/public-api";

const SESSION_SELECT = `
  *,
  workout:workouts (
    *,
    plan:plans (*)
  ),
  exercises:workout_session_exercises (
    *,
    sets:workout_session_exercise_sets (*)
  )
`;

export interface CreateWorkoutSessionVariables {
  workoutId: string;
}

/**
 * Starts a Workout through `POST /v1/workout-sessions`, or resumes the
 * Workout Session already open for it (the API answers 200 instead of 201,
 * handled alike), then reads it through Supabase. Rejects with an `ApiError`.
 */
export const useCreateWorkoutSessionMutation = createMutation<
  WorkoutSession,
  CreateWorkoutSessionVariables
>({
  mutationFn: async ({
    workoutId,
  }: CreateWorkoutSessionVariables): Promise<WorkoutSession> => {
    const { data } = await publicApi().POST("/v1/workout-sessions", {
      body: { workout_id: workoutId },
    });
    if (!data) {
      throw new ApiError("Public API answered without a Workout Session");
    }
    return fetchWorkoutSession(data.data.id);
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

export const FINISH_WORKOUT_SESSION_MUTATION_KEY = ["finish-workout-session"];

/**
 * Finishes a Workout Session through `POST /v1/workout-sessions/{id}/finish`,
 * which moves its Workout to the end of the Plan's rotation, then reads it
 * through Supabase. An already finished one (a retry, a double tap) is a
 * success. Rejects with an `ApiError`.
 */
export const useFinishWorkoutSessionMutation = createMutation<
  WorkoutSession,
  FinishWorkoutSessionVariables
>({
  mutationFn: async ({ sessionId }: FinishWorkoutSessionVariables) => {
    await publicApi().POST("/v1/workout-sessions/{id}/finish", {
      params: { path: { id: sessionId } },
    });
    return fetchWorkoutSession(sessionId);
  },
  mutationKey: FINISH_WORKOUT_SESSION_MUTATION_KEY,
});

const workoutSessionPlanChanges = async (
  sessionId: string,
  apply: boolean
): Promise<PlanChanges> => {
  const { data, error } = await supabase.rpc("workout_session_plan_changes", {
    apply,
    session_id: sessionId,
  });
  if (error) {
    throw error;
  }
  return data as unknown as PlanChanges;
};

/**
 * The structural changes a finished Workout Session made to its Workout
 * (`workout_session_plan_changes` with `apply = false`), without writing
 * anything.
 */
export const fetchPlanChanges = (sessionId: string): Promise<PlanChanges> =>
  workoutSessionPlanChanges(sessionId, false);

export interface ApplyPlanChangesVariables {
  sessionId: string;
}

/**
 * Writes those changes to the Plan in one transaction (`apply = true`) and
 * answers what it applied. Once applied, both modes answer no changes, so a
 * retried apply never writes twice.
 */
export const useApplyPlanChangesMutation = createMutation<
  PlanChanges,
  ApplyPlanChangesVariables
>({
  mutationFn: ({ sessionId }: ApplyPlanChangesVariables) =>
    workoutSessionPlanChanges(sessionId, true),
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
