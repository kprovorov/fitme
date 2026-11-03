import { ApiError } from "@fitme/api-client";
import type { MeasurementSystem } from "@fitme/core";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { createMutation } from "react-query-kit";
import { rememberProfileWrite } from "~/hooks/mutations/profiles";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { usePlanQuery, usePlansQuery } from "~/hooks/queries/plans";
import type { Profile } from "~/hooks/queries/profiles";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionHistoryQuery,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { publicApi } from "~/lib/public-api";
import type { WriteStarter } from "~/lib/write-answers";

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
