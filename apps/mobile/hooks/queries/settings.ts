import { ApiError } from "@fitme/api-client";
import type { MeasurementSystem } from "@fitme/core";
import {
  hashKey,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { createMutation } from "react-query-kit";
import { rememberProfileWrite } from "~/hooks/mutations/profiles";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { usePlanQuery, usePlansQuery } from "~/hooks/queries/plans";
import { type Profile, useProfileQuery } from "~/hooks/queries/profiles";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionHistoryQuery,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { measurementSystemOf } from "~/lib/profile";
import { publicApi } from "~/lib/public-api";
import { isStillWriteStarter, type WriteStarter } from "~/lib/write-answers";

/**
 * Every query whose answer carries a weight. Switching the measurement system
 * converts every stored height and weight on the server, so each of these is
 * in the old unit until it has been read again. Each key is a base key, which
 * matches every one of that query's variables, so a Plan or Workout Session of
 * any id is covered. The Profile is not here: it holds the unit the Screens
 * taking their unit from it show, so the switch shows it first (the PATCH
 * answer, or the Profile read again when there was none), before asking for
 * these.
 */
const WEIGHED_QUERY_KEYS: QueryKey[] = [
  usePlansQuery.getKey(),
  // A Plan's screen and the Workout screen, which picks its Workout from it.
  usePlanQuery.getKey(),
  // The Workout Session screens, the Exercise screen and the Summary alike.
  useWorkoutSessionQuery.getKey(),
  // No weight of its own yet, but it answers from a Workout Session summary.
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionHistoryQuery.getKey(),
  useExerciseHistoryQuery.getKey(),
];

/**
 * Re-reads every mounted Screen showing a weight, so none keeps an old unit's
 * number (FIT-539). Call it with the Profile already in the new system.
 * Resolves once they have, whether or not each read succeeded: a failed one
 * leaves its Screen on its own error state.
 */
export const invalidateWeighedQueries = async (
  client: QueryClient
): Promise<void> => {
  await Promise.all(
    WEIGHED_QUERY_KEYS.map((queryKey) => client.invalidateQueries({ queryKey }))
  );
};

/**
 * A measurement system switch whose answer couldn't be checked (FIT-553):
 * the system it asked for, and the `WriteStarter` naming the User who asked.
 * The Profile is dropped in that case, so the weighed queries are left in the
 * old unit on purpose, with their numbers unconverted; the next Profile read
 * that succeeds is what says whether the conversion committed after all.
 */
interface PendingWeighedRefresh {
  starter: WriteStarter | undefined;
  system: MeasurementSystem;
}

/**
 * The switch awaiting a Profile read, per query cache, with the subscription
 * watching for one. There is at most one: a second switch replaces it, and
 * the app has one cache, so this is one pending refresh in all.
 */
const pendingWeighedRefreshes = new WeakMap<
  QueryClient,
  { pending: PendingWeighedRefresh; unsubscribe: () => void }
>();

/** Drops the pending refresh, with the subscription it was watching through. */
const forgetPendingWeighedRefresh = (client: QueryClient): void => {
  const kept = pendingWeighedRefreshes.get(client);
  if (!kept) {
    return;
  }
  pendingWeighedRefreshes.delete(client);
  kept.unsubscribe();
};

/**
 * What a Profile that has just landed says about the pending switch: once it
 * shows the system that switch asked for, the conversion did commit, so every
 * weighed query is read again (the refresh the switch itself couldn't run).
 * It runs at most once, whatever lands next, and only for the User who asked:
 * signing out clears the cache but not a flag, and the next User's Profile is
 * no evidence about theirs.
 */
const consumePendingWeighedRefresh = (
  client: QueryClient,
  profile: Profile | null
): void => {
  const kept = pendingWeighedRefreshes.get(client);
  if (!kept) {
    return;
  }
  const { starter, system } = kept.pending;
  forgetPendingWeighedRefresh(client);
  if (!isStillWriteStarter(starter)) {
    return;
  }
  if (measurementSystemOf(profile) === system) {
    invalidateWeighedQueries(client);
  }
};

/**
 * Remembers a switch to `system` whose answer couldn't be checked, so the
 * next Profile read that lands can finish what it couldn't: confirm the
 * conversion and re-read every weight. Call it before dropping the Profile,
 * so the read that dropping it starts is already being watched for.
 *
 * It watches the Profile query itself rather than any one Screen: the Screen
 * that switched can be gone by then, and the read that confirms it is
 * whichever Screen asks next.
 *
 * The Profile leaving the cache drops the switch unconsumed, and nothing is
 * left mislabelled by that. A sign-out clears every weighed query with it. A
 * collection only happens with no observer left, and a Screen that takes its
 * unit from the Profile is one (the sets tables, the Exercise history, Home),
 * so none is mounted; the Screens that don't (History, a Workout Session)
 * read their `weight_unit` from the same answer as their numbers, so those
 * two can never disagree.
 */
export const rememberPendingWeighedRefresh = (
  client: QueryClient,
  system: MeasurementSystem,
  starter: WriteStarter | undefined
): void => {
  forgetPendingWeighedRefresh(client);
  const profileHash = hashKey(useProfileQuery.getKey());
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.query.queryHash !== profileHash) {
      return;
    }
    if (event.type === "removed") {
      forgetPendingWeighedRefresh(client);
      return;
    }
    // A read that landed, or a write's answer seeded into it: either is the
    // server's own view of the saved system. An invalidation or a reset is
    // not (`invalidate` / `setState`), and neither is a failed read.
    if (event.type === "updated" && event.action.type === "success") {
      consumePendingWeighedRefresh(
        client,
        event.query.state.data as Profile | null
      );
    }
  });
  pendingWeighedRefreshes.set(client, {
    pending: { starter, system },
    unsubscribe,
  });
};

/**
 * Switches the User's measurement system through `PATCH /v1/profile`, which
 * converts every stored height and weight. Answers the converted Profile,
 * which the caller shows as the Profile (`seedProfile`) with the
 * `WriteStarter` its `onSettled` gets; rejects with an `ApiError`.
 */
export const useUpdateMeasurementSystemMutation = createMutation<
  Profile,
  MeasurementSystem,
  Error,
  WriteStarter
>({
  mutationFn: async (
    measurementSystem: MeasurementSystem
  ): Promise<Profile> => {
    const { data } = await publicApi().PATCH("/v1/profile", {
      body: { measurement_system: measurementSystem },
    });
    if (!data) {
      throw new ApiError("Public API answered no Profile");
    }
    return data.data;
  },
  onMutate: rememberProfileWrite,
});
