import { ApiError } from "@fitme/api-client";
import type { QueryClient } from "@tanstack/react-query";

import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import type { WorkoutSession } from "~/hooks/queries/workout-sessions";

/**
 * Whether a write's refusal may mean its Workout Session has ended: finished
 * (409 `session_finished`) or gone (404, which a set or an Exercise removed
 * elsewhere answers too).
 */
export const mayMeanSessionEnded = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.code === "session_finished" || error.code === "not_found");

/**
 * Reads the Workout Session again at once after a write it refused, rather
 * than at the next poll, and answers whether that read says it has ended:
 * finished, or gone (the API's 404). Its screens then move on as for a poll
 * (`useEndedWorkoutSession`): the Summary, or closed as after a discard, so
 * the caller says nothing about the write. Any other refusal (a 429
 * included) reads nothing, and a read that fails or finds it still open
 * answers false: the caller shows the write's usual error.
 */
export const hasRefusingSessionEnded = async (
  client: QueryClient,
  sessionId: string,
  error: unknown
): Promise<boolean> => {
  if (!mayMeanSessionEnded(error)) {
    return false;
  }

  const queryKey = useWorkoutSessionQuery.getKey({ sessionId });
  const askedAt = Date.now();

  // A read in flight was asked before the refusal: it's asked again.
  await client.refetchQueries({ exact: true, queryKey });

  let read = client.getQueryState<WorkoutSession>(queryKey);

  // Another read asked meanwhile cancelled this one: it was asked after the
  // refusal too, so it's the one waited for.
  while (read?.fetchStatus === "fetching") {
    // oxlint-disable-next-line no-await-in-loop -- Each waits for the last.
    await client.refetchQueries(
      { exact: true, queryKey },
      { cancelRefetch: false }
    );
    read = client.getQueryState<WorkoutSession>(queryKey);
  }

  // Dropped: a screen of the session has closed them as gone already.
  if (!read) {
    return true;
  }

  if (read.dataUpdatedAt >= askedAt && read.data?.finished_at) {
    return true;
  }

  return (
    read.errorUpdatedAt >= askedAt &&
    read.error instanceof ApiError &&
    read.error.code === "not_found"
  );
};
