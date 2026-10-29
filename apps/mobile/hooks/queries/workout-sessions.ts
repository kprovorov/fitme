import type { WorkoutSession } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { ApiError } from "~/lib/api/client";
import type { PlanUpdate } from "~/lib/plan-changes";
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

/** The User's one open Workout Session (ADR 0013), as Start needs it. */
export interface OpenWorkoutSession {
  id: string;
  planId: string | null;
  workoutId: string | null;
  /** `null` once its Workout is gone. */
  workoutName: string | null;
}

export const OPEN_WORKOUT_SESSION_QUERY_KEY = ["open-workout-session"];

/** How often an open Workout Session is read again while it blocks Start. */
export const OPEN_WORKOUT_SESSION_POLL_MS = 30_000;

/**
 * Polls while a Workout Session is open: one finished or deleted elsewhere
 * (MCP, another device) would otherwise block Start until the screen
 * remounts. With none open there's nothing to poll for: a session opened
 * elsewhere meanwhile comes back as Start's 409, which re-reads it.
 */
export const openWorkoutSessionRefetchInterval = (
  openSession: OpenWorkoutSession | null | undefined
): number | false => (openSession ? OPEN_WORKOUT_SESSION_POLL_MS : false);

/**
 * The User's open Workout Session, or `null` with none: a User has at most
 * one, so it blocks starting any other Workout.
 */
export const useOpenWorkoutSessionQuery =
  createQuery<OpenWorkoutSession | null>({
    fetcher: async (): Promise<OpenWorkoutSession | null> => {
      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id, plan_id, workout_id, workout:workouts (name)")
        .is("finished_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        return null;
      }
      // A to-one embed: PostgREST answers an object (or `null` once the
      // Workout is gone), whatever the generated types say.
      const workout = data.workout as unknown as { name: string } | null;
      return {
        id: data.id,
        planId: data.plan_id,
        workoutId: data.workout_id,
        workoutName: workout?.name ?? null,
      };
    },
    queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
    refetchInterval: (query) =>
      openWorkoutSessionRefetchInterval(query.state.data),
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

const planUpdateOf = (answer: { data: PlanUpdate } | undefined): PlanUpdate => {
  if (!answer) {
    throw new ApiError("Public API answered without a Plan Update");
  }
  return answer.data;
};

/**
 * The Plan Update of a finished Workout Session (`GET
 * /v1/workout-sessions/{id}/plan-update`): the changes it made to its
 * Workout, Exercises as slugs and weights in `weight_unit`, without writing
 * anything. Rejects with an `ApiError`.
 */
export const fetchPlanUpdate = async (
  sessionId: string
): Promise<PlanUpdate> => {
  const { data } = await publicApi().GET(
    "/v1/workout-sessions/{id}/plan-update",
    { params: { path: { id: sessionId } } }
  );
  return planUpdateOf(data);
};

export interface ApplyPlanUpdateVariables {
  sessionId: string;
}

/**
 * Applies the Plan Update in one transaction (`POST
 * /v1/workout-sessions/{id}/plan-update`) and answers what it applied. Once
 * applied there are no changes, so a retried apply never writes twice.
 * Rejects with an `ApiError`.
 */
export const useApplyPlanUpdateMutation = createMutation<
  PlanUpdate,
  ApplyPlanUpdateVariables
>({
  mutationFn: async ({ sessionId }: ApplyPlanUpdateVariables) => {
    const { data } = await publicApi().POST(
      "/v1/workout-sessions/{id}/plan-update",
      { params: { path: { id: sessionId } } }
    );
    return planUpdateOf(data);
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
