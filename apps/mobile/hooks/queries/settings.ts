import type { MeasurementSystem } from "@fitme/core";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { createMutation } from "react-query-kit";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { usePlanQuery, usePlansQuery } from "~/hooks/queries/plans";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionHistoryQuery,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { useWorkoutQuery } from "~/hooks/queries/workouts";
import { publicApi } from "~/lib/public-api";

/**
 * Every query whose answer carries a weight. Switching the measurement system
 * converts every stored height and weight on the server, so each of these is
 * in the old unit until it has been read again. Each key is a base key, which
 * matches every one of that query's variables, so a Plan or Workout Session of
 * any id is covered. The Profile is not here: its reader switches the system
 * and reads it again itself.
 */
const WEIGHED_QUERY_KEYS: QueryKey[] = [
  usePlansQuery.getKey(),
  usePlanQuery.getKey(),
  useWorkoutQuery.getKey(),
  useWorkoutSessionQuery.getKey(),
  useWorkoutSessionExerciseQuery.getKey(),
  // No weight of its own yet, but it answers from a Workout Session summary.
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionHistoryQuery.getKey(),
  useExerciseHistoryQuery.getKey(),
];

/**
 * Re-reads every mounted Screen showing a weight, so none keeps an old unit's
 * number (FIT-539). Resolves once they have, whether or not each read
 * succeeded: a failed one leaves its Screen on its own error state.
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
 * converts every stored height and weight. Rejects with an `ApiError`.
 */
export const useUpdateMeasurementSystemMutation = createMutation<
  void,
  MeasurementSystem
>({
  mutationFn: async (measurementSystem: MeasurementSystem): Promise<void> => {
    await publicApi().PATCH("/v1/profile", {
      body: { measurement_system: measurementSystem },
    });
  },
  // On the mutation, not the call: the weights are stale wherever the User
  // goes next, even if they leave the Screen before the switch lands.
  onSuccess: async (_data, _system, _result, { client }) => {
    await invalidateWeighedQueries(client);
  },
});
