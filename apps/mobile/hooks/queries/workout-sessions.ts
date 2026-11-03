import type { components } from "@fitme/api-client";
import { ApiError } from "@fitme/api-client";
import type { WorkoutSession } from "@fitme/core";
import { createMutation, createQuery } from "react-query-kit";
import { supabase } from "@/lib/supabase";
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

/**
 * The User's one open Workout Session (ADR 0013), as `GET
 * /v1/workout-sessions` summarises it: its `started_at`, and its `plan` and
 * `workout` (`null` once that Workout is gone).
 */
export type OpenWorkoutSession = components["schemas"]["WorkoutSessionSummary"];

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
 * The User's open Workout Session, or `null` with none, read through `GET
 * /v1/workout-sessions?status=in_progress&limit=1`: a User has at most one
 * (ADR 0013), so the first is the only one. It is the app's one answer to
 * "is this Workout's session open?" (the Workout tab's carousel, the Plan
 * screen's cards, the Workout screen's Start and History's empty card), and
 * it blocks starting any other Workout. Rejects with an `ApiError`.
 */
export const fetchOpenWorkoutSession =
  async (): Promise<OpenWorkoutSession | null> => {
    const { data } = await publicApi().GET("/v1/workout-sessions", {
      params: { query: { limit: 1, status: "in_progress" } },
    });
    if (!data) {
      throw new ApiError("Public API answered without Workout Sessions");
    }
    return data.data[0] ?? null;
  };

export const useOpenWorkoutSessionQuery =
  createQuery<OpenWorkoutSession | null>({
    fetcher: fetchOpenWorkoutSession,
    queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
    refetchInterval: (query) =>
      openWorkoutSessionRefetchInterval(query.state.data),
  });

/**
 * The Workout's own open Workout Session, or `null` while it has none (or
 * the open Workout Session hasn't been read): from
 * `useOpenWorkoutSessionQuery`, so every screen asking agrees.
 */
export const useOwnOpenWorkoutSession = (
  workoutId: string
): OpenWorkoutSession | null => {
  const { data: openSession } = useOpenWorkoutSessionQuery();
  return openSession && openSession.workout?.id === workoutId
    ? openSession
    : null;
};

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

/** A finished Workout Session as History lists it, from the Public API. */
export type WorkoutSessionHistoryEntry =
  components["schemas"]["WorkoutSessionSummary"];

/** Every finished Workout Session of the User, and the unit their volumes are in. */
export interface WorkoutSessionHistory {
  sessions: WorkoutSessionHistoryEntry[];
  weightUnit: components["schemas"]["WeightUnit"];
}

/** The Public API's largest page of Workout Sessions. */
const HISTORY_PAGE_SIZE = 50;

/** Reads of every page tried before keeping one that changed while it was read. */
const HISTORY_READ_ATTEMPTS = 3;

/** One read of every page, and whether nothing changed while it was read. */
const readHistoryPages = async (): Promise<
  WorkoutSessionHistory & { consistent: boolean }
> => {
  const sessions = new Map<string, WorkoutSessionHistoryEntry>();
  let weightUnit: WorkoutSessionHistory["weightUnit"] | null = null;
  let consistent = true;
  let total: number | null = null;
  let offset = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each page's offset follows from the last one's
    const { data } = await publicApi().GET("/v1/workout-sessions", {
      params: {
        query: { limit: HISTORY_PAGE_SIZE, offset, status: "finished" },
      },
    });
    if (!data) {
      throw new ApiError("Public API answered without Workout Sessions");
    }
    // Another unit or total: the measurement system changed, or a session
    // was finished or deleted (shifting the rest by one), between two pages.
    consistent &&=
      (weightUnit === null || data.weight_unit === weightUnit) &&
      (total === null || data.total === total);
    weightUnit = data.weight_unit;
    ({ total } = data);
    for (const session of data.data) {
      sessions.set(session.id, session);
    }
    if (!data.hasMore || data.data.length === 0) {
      break;
    }
    offset += data.data.length;
  }
  return {
    consistent: consistent && sessions.size === total,
    sessions: [...sessions.values()].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    ),
    weightUnit: weightUnit ?? "kg",
  };
};

/**
 * Every finished Workout Session, newest start first, read through
 * `GET /v1/workout-sessions` page after page until none follow: month counts
 * and monthly totals need all of them, so no page size may cut them short.
 * A read that changed while it ran (a session finished or deleted between
 * two pages, or the measurement system changed) is read again, up to
 * `HISTORY_READ_ATTEMPTS` times, then kept. Rejects with an `ApiError`.
 */
export const fetchWorkoutSessionHistory =
  async (): Promise<WorkoutSessionHistory> => {
    for (let attempt = 1; ; attempt += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: a read is retried only after the last one changed
      const { consistent, ...history } = await readHistoryPages();
      if (consistent || attempt === HISTORY_READ_ATTEMPTS) {
        return history;
      }
    }
  };

export const useWorkoutSessionHistoryQuery = createQuery<
  WorkoutSessionHistory,
  void
>({
  fetcher: fetchWorkoutSessionHistory,
  queryKey: ["workout-sessions-history"],
});
