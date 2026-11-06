import { ApiError } from "@fitme/api-client";
import type { components } from "@fitme/api-client";

import { publicApi } from "~/lib/public-api";
import type { PublicApiForOptions } from "~/lib/public-api";

/** A Plan as `GET /v1/plans` lists it: its Workouts summarised. */
export type DashboardPlan = components["schemas"]["PlanSummary"];

/** A Workout Session as `GET /v1/workout-sessions` lists it. */
export type DashboardSession = components["schemas"]["WorkoutSessionSummary"];

/** How many of the User's latest Workout Sessions the dashboard lists. */
const RECENT_SESSIONS_LIMIT = 10;

export interface DashboardData {
  plans: DashboardPlan[];
  sessions: DashboardSession[];
}

export type DashboardResult =
  | { ok: false; error: ApiError }
  | { ok: true; data: DashboardData };

export type LoadDashboardOptions = PublicApiForOptions;

/** A 2xx body that isn't the list the contract promises is unusable. */
const listOf = <T>(value: T[] | undefined, what: string): T[] => {
  if (!Array.isArray(value)) {
    throw new ApiError(`The Public API answered without ${what}`);
  }

  return value;
};

/**
 * Whether a failed read is one nothing else reports: a network failure, an
 * unset `PUBLIC_API_URL`, a refused or broken answer. The page reports those
 * to Sentry itself, since it renders the error state instead of throwing and
 * `onRequestError` never sees them. The limits and refusals the dashboard
 * shows on purpose (a 429, any other 4xx) aren't worth an event.
 */
export const isUnexpectedFailure = ({ status }: ApiError): boolean =>
  status === null || status === 401 || status >= 500;

/**
 * The active Plan first, then the newest, as the dashboard has always shown
 * them (`GET /v1/plans` answers newest first). A stable sort, so Plans with
 * the same `is_active` keep the API's order.
 */
const activeFirst = (plans: DashboardPlan[]): DashboardPlan[] =>
  plans.toSorted(
    (a, b) => Number(Boolean(b.is_active)) - Number(Boolean(a.is_active))
  );

/**
 * The dashboard's data: the User's live Plans and their latest Workout
 * Sessions, read in parallel from `/v1` with their Clerk session token as the
 * bearer (ADR 0011). No Supabase, no service secret and no database access.
 *
 * Every failure the Public API client raises — a non-2xx answer, a 429, a
 * network failure, an unset `PUBLIC_API_URL` — comes back as `ok: false` with
 * its `ApiError`, so the page renders its error state instead of crashing.
 * Anything else is rethrown, Next's own control-flow errors included.
 */
export const loadDashboard = async ({
  apiUrl,
  fetch,
  getToken,
}: LoadDashboardOptions): Promise<DashboardResult> => {
  try {
    const api = publicApi({ apiUrl, fetch, getToken });

    const [plans, sessions] = await Promise.all([
      api.GET("/v1/plans"),
      api.GET("/v1/workout-sessions", {
        params: { query: { limit: RECENT_SESSIONS_LIMIT } },
      }),
    ]);

    return {
      data: {
        plans: activeFirst(listOf(plans.data?.data, "Plans")),
        sessions: listOf(sessions.data?.data, "Workout Sessions"),
      },
      ok: true,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error, ok: false };
    }

    // openapi-fetch parses the body itself, so a 200 that isn't the API's JSON
    // (a sign-in page from a misconfigured `PUBLIC_API_URL`) surfaces here.
    if (error instanceof SyntaxError) {
      return {
        error: new ApiError("The Public API answered something unreadable", {
          cause: error,
        }),
        ok: false,
      };
    }

    throw error;
  }
};
