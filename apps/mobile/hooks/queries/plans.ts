import { ApiError } from "@fitme/api-client";
import type { components } from "@fitme/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { createMutation, createQuery } from "react-query-kit";

import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import { IS_E2E } from "~/lib/constants";
import type { NewPlan } from "~/lib/plan-card";
import { publicApi } from "~/lib/public-api";
import { segmentClient } from "~/lib/segment";
import { rememberWriteStarter, seedWriteAnswer } from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

/**
 * The Plan details a Plan built by hand leaves unset (ADR 0017): the app
 * shows each only when it's set. The committed OpenAPI document still types
 * them as always present, because the API answers them as nullable only
 * after the migration (rollout step 3), so the app widens them itself and
 * handles a `null` today.
 */
interface OptionalPlanDetails {
  experience_level: string | null;
  goal: string | null;
  place: string | null;
  workout_duration: number | null;
}

/** A Plan as `GET /v1/plans` lists it: its Workouts summarised. */
export type PlanSummary = Omit<
  components["schemas"]["PlanSummary"],
  keyof OptionalPlanDetails
> &
  OptionalPlanDetails;

/**
 * A Plan in full, as `GET /v1/plans/{id}` answers it: its Workouts in
 * rotation order, their Exercises and sets in order, and `weight_unit`.
 */
export type FullPlan = Omit<
  components["schemas"]["Plan"],
  keyof OptionalPlanDetails
> &
  OptionalPlanDetails;

/** One Workout of a `FullPlan`, with its Exercises and sets. */
export type PlanWorkout = components["schemas"]["PlanWorkout"];

/** One Exercise of a `PlanWorkout`, by its Exercise slug, with its sets. */
export type PlanExercise = components["schemas"]["PlanExercise"];

/** One planned set of a `PlanExercise`: its targets and rest. */
export type PlanSet = components["schemas"]["PlanSet"];

/** Every query reading Plans, the lists' and each Plan's alike. */
export const PLANS_QUERY_KEY = ["plans"];

/**
 * The User's live Plans, newest first, each with its Workouts summarised,
 * through `GET /v1/plans` (not paged): the Plans list, and whether Home has
 * any Plan to show. Under
 * `PLANS_QUERY_KEY`, so every write invalidating the Plans reaches it.
 * Rejects with an `ApiError`.
 */
export const usePlanSummariesQuery = createQuery<PlanSummary[]>({
  fetcher: async (): Promise<PlanSummary[]> => {
    const { data } = await publicApi().GET("/v1/plans");

    if (!data) {
      throw new ApiError("Public API answered no Plans");
    }

    return data.data;
  },
  queryKey: [...PLANS_QUERY_KEY, "summaries"],
  // A 429 is the User's to wait out; the screens offer Try Again.
  retry: false,
});

/**
 * The User's active Plan in full through `GET /v1/plans/active`, or `null`
 * without one: Home's Workout cards. Under `PLANS_QUERY_KEY`, so every write
 * invalidating the Plans (activating, creating, deleting one, a finish, a
 * measurement system switch) reaches it. Rejects with an `ApiError`.
 */
export const useActivePlanQuery = createQuery<FullPlan | null>({
  fetcher: async (): Promise<FullPlan | null> => {
    const { data } = await publicApi().GET("/v1/plans/active");

    if (!data) {
      throw new ApiError("Public API answered no active Plan");
    }

    return data.data;
  },
  queryKey: [...PLANS_QUERY_KEY, "active"],
  // Never retried, like the summaries.
  retry: false,
});

export interface PlanQueryVariables {
  id: string;
}

/**
 * The Plan in full through `GET /v1/plans/{id}`, or `null` once it's gone:
 * the API answers 404 for a Plan deleted, missing or another User's. Any
 * other failure rejects with an `ApiError`.
 */
export const usePlanQuery = createQuery<FullPlan | null, PlanQueryVariables>({
  fetcher: async ({ id }: PlanQueryVariables): Promise<FullPlan | null> => {
    try {
      const { data } = await publicApi().GET("/v1/plans/{id}", {
        params: { path: { id } },
      });

      if (!data) {
        throw new ApiError("Public API answered no Plan");
      }

      return data.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  },
  queryKey: ["plan"],
  // A 429 is the User's to wait out; the screens offer Try Again.
  retry: false,
});

/**
 * After a write answering the Plan in full: that Plan's query shows the
 * answer as is (no re-read; a read of it in flight is cancelled), unless
 * something newer landed in it since the write started, when it's read again
 * (`seedWriteAnswer`). Every other Plan read (the lists, the active Plan, the
 * other Plans, whose `is_active` may have changed) and the Weekly goal (the
 * active Plan's frequency) are read again, all only while the User who
 * started the write is still signed in.
 */
const seedPlan = (
  client: QueryClient,
  plan: FullPlan,
  starter: WriteStarter | undefined
) =>
  seedWriteAnswer(client, starter, {
    alsoInvalidate: [
      { queryKey: PLANS_QUERY_KEY },
      {
        predicate: ({ queryKey }) =>
          queryKey[0] === "plan" &&
          (queryKey[1] as PlanQueryVariables | undefined)?.id !== plan.id,
      },
      { queryKey: WEEKLY_GOALS_QUERY_KEY },
    ],
    answer: plan,
    queryKey: usePlanQuery.getKey({ id: plan.id }),
  });

/**
 * Saves a Plan through `POST /v1/plans` and makes it the active one, in one
 * transaction: nothing is saved unless all of it is. Fires `Plan Saved` and
 * `Plan Activated` once it has, shows the new Plan from the answer and reads
 * the Plan lists again. Answers the new Plan; rejects with an `ApiError`
 * (`unknown_exercises`, `library_unavailable`, …).
 */
export const useCreatePlanMutation = createMutation<
  FullPlan,
  NewPlan,
  Error,
  WriteStarter
>({
  mutationFn: async (plan: NewPlan): Promise<FullPlan> => {
    const { data } = await publicApi().POST("/v1/plans", {
      body: { ...plan, activate: true },
    });

    if (!data) {
      throw new ApiError("Public API answered no Plan");
    }

    const { id } = data.data;

    if (!IS_E2E) {
      segmentClient.track("Plan Saved", { plan_id: id });
      segmentClient.track("Plan Activated", { plan_id: id });
    }

    return data.data;
  },
  // On the mutation, not the call: it still runs once the card is gone. The
  // new Plan has no query yet, so there's no revision to remember.
  onMutate: (_plan, { client }) => rememberWriteStarter(client, []),
  onSuccess: async (plan, _variables, starter, { client }) => {
    await seedPlan(client, plan, starter);
  },
});

/**
 * Makes the Plan the User's active one through
 * `POST /v1/plans/{id}/activate`; every other Plan of theirs goes inactive.
 * Shows the Plan from the answer and reads every other Plan read again; a
 * caller passing its own `onMutate` or `onSuccess` to the hook replaces
 * that, so pass `onSuccess` to `mutate` instead. Rejects with an `ApiError`.
 */
export const useActivatePlanMutation = createMutation<
  FullPlan,
  { id: string },
  Error,
  WriteStarter
>({
  mutationFn: async ({ id }: { id: string }): Promise<FullPlan> => {
    const { data } = await publicApi().POST("/v1/plans/{id}/activate", {
      params: { path: { id } },
    });

    if (!data) {
      throw new ApiError("Public API answered no Plan");
    }

    if (!IS_E2E) {
      segmentClient.track("Plan Activated", { plan_id: id });
    }

    return data.data;
  },
  // On the mutation, not the call: it still runs once the screen is gone.
  onMutate: ({ id }, { client }) =>
    rememberWriteStarter(client, [usePlanQuery.getKey({ id })]),
  onSuccess: async (plan, _variables, starter, { client }) => {
    await seedPlan(client, plan, starter);
  },
});

/**
 * Soft-deletes the Plan through `DELETE /v1/plans/{id}` (its Workout Sessions
 * stay); a Plan already deleted succeeds again. Rejects with an `ApiError`.
 */
export const useDeletePlanMutation = createMutation<void, { id: string }>({
  mutationFn: async ({ id }: { id: string }): Promise<void> => {
    await publicApi().DELETE("/v1/plans/{id}", { params: { path: { id } } });

    if (!IS_E2E) {
      segmentClient.track("Plan Deleted", { plan_id: id });
    }
  },
});
