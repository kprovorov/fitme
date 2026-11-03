import { ApiError, type components } from "@fitme/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { createMutation, createQuery } from "react-query-kit";
import type { PlanUpdate } from "~/lib/plan-changes";
import { publicApi } from "~/lib/public-api";

/**
 * A Workout Session in full, as `GET /v1/workout-sessions/{id}` answers it:
 * its `plan` and `workout` (`null` once gone), its Exercises and their sets
 * in order (each with `logged_at`), and the `weight_unit` its weights are in.
 */
export type WorkoutSession = components["schemas"]["WorkoutSession"];

/** One Exercise of a `WorkoutSession`, by Exercise slug, with its sets. */
export type WorkoutSessionExercise =
  components["schemas"]["WorkoutSessionExercise"];

/** One set of a `WorkoutSessionExercise`, weights in the session's unit. */
export type WorkoutSessionSet = components["schemas"]["WorkoutSessionSet"];

/** Every query reading a Workout Session, each under its id. */
export const WORKOUT_SESSION_QUERY_KEY = ["workout-session"];

/**
 * How long a Workout Session read (or a write's answer) is shown without
 * reading it again when another screen of it mounts: the session screen
 * opening after Start, the Exercise screen and the Summary all show the
 * answer they're handed. Every edit re-reads it whatever its age.
 */
export const WORKOUT_SESSION_STALE_TIME_MS = 30_000;

export interface GetWorkoutSessionVariables {
  sessionId: string;
}

/**
 * The User's Workout Session through `GET /v1/workout-sessions/{id}`. A
 * missing or another User's one is the API's 404; like any other failure it
 * rejects with an `ApiError`.
 */
export const fetchWorkoutSession = async (
  sessionId: string
): Promise<WorkoutSession> => {
  const { data } = await publicApi().GET("/v1/workout-sessions/{id}", {
    params: { path: { id: sessionId } },
  });
  if (!data) {
    throw new ApiError("Public API answered without a Workout Session");
  }
  return data.data;
};

export const useWorkoutSessionQuery = createQuery<
  WorkoutSession,
  GetWorkoutSessionVariables
>({
  fetcher: ({ sessionId }: GetWorkoutSessionVariables) =>
    fetchWorkoutSession(sessionId),
  queryKey: WORKOUT_SESSION_QUERY_KEY,
  // A 429 is the User's to wait out; the screens offer Try again.
  retry: false,
  staleTime: WORKOUT_SESSION_STALE_TIME_MS,
});

/**
 * Shows a write's answer as the Workout Session's read, with no re-read: a
 * read of it still in flight was answered before the write and would land
 * on top of the answer, so it's dropped first.
 */
export const seedWorkoutSession = async (
  client: QueryClient,
  session: WorkoutSession
) => {
  const key = useWorkoutSessionQuery.getKey({ sessionId: session.id });
  await client.cancelQueries({ exact: true, queryKey: key });
  client.setQueryData(key, session);
};

export interface CreateWorkoutSessionVariables {
  workoutId: string;
}

/**
 * Starts a Workout through `POST /v1/workout-sessions`, or resumes the
 * Workout Session already open for it (the API answers 200 instead of 201,
 * handled alike), and answers the session in full; `useStartWorkout` shows
 * it as the session's read. Rejects with an `ApiError`.
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
    return data.data;
  },
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
 * The Workout's own open Workout Session, or `null` while it has none: from
 * `useOpenWorkoutSessionQuery`, so every screen asking agrees. A failed
 * refresh keeps the last answer. With no answer yet (loading, or the read
 * failed) it's `null` too, which the Workout tab's cards and the Plan
 * screen's Workout cards may show as Start or the Workout screen: Start asks
 * the API, which resumes the Workout's own open session (200) or refuses
 * another's (409, which re-reads it and says "Finish <Workout> first"). The
 * Workout screen and History's empty card don't guess: they wait for the
 * read, and show their load error when it fails.
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
 * which moves its Workout to the end of the Plan's rotation, and answers the
 * finished session in full; `useFinishWorkoutSession` shows it as the
 * session's read. An already finished one (a retry, a double tap) is a
 * success. Rejects with an `ApiError`.
 */
export const useFinishWorkoutSessionMutation = createMutation<
  WorkoutSession,
  FinishWorkoutSessionVariables
>({
  mutationFn: async ({
    sessionId,
  }: FinishWorkoutSessionVariables): Promise<WorkoutSession> => {
    const { data } = await publicApi().POST(
      "/v1/workout-sessions/{id}/finish",
      { params: { path: { id: sessionId } } }
    );
    if (!data) {
      throw new ApiError("Public API answered without a Workout Session");
    }
    return data.data;
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
