import { ApiError, type components } from "@fitme/api-client";
import { createInfiniteQuery } from "react-query-kit";
import { publicApi } from "~/lib/public-api";

/**
 * A page of the User's history for one Exercise, as
 * `GET /v1/workout-session-exercises` answers it: its entries newest Workout
 * Session first, and the `weight_unit` their weights are in.
 */
export type ExerciseHistoryPage = components["schemas"]["ExerciseHistoryPage"];

/** One time the Exercise appeared in one of the User's Workout Sessions. */
export type ExerciseHistoryEntry =
  components["schemas"]["ExerciseHistoryEntry"];

/** One logged set of an entry, its weight in the page's `weight_unit`. */
export type ExerciseHistorySet = components["schemas"]["ExerciseHistorySet"];

/** Entries read at a time, as the User scrolls; the API's default page. */
export const EXERCISE_HISTORY_PAGE_SIZE = 20;

/** Every read of an Exercise's history, each under its Exercise slug. */
export const EXERCISE_HISTORY_QUERY_KEY = ["exercise-history"];

export interface ExerciseHistoryVariables {
  /** The Exercise, by its Exercise slug. */
  exerciseSlug: string;
}

/**
 * One page of the User's history for an Exercise through
 * `GET /v1/workout-session-exercises`: every Workout Session it appeared in,
 * newest first, with its logged sets (a bodyweight set, which logs no weight,
 * included) and their targets. Rejects with an `ApiError`.
 */
export const fetchExerciseHistory = async (
  exerciseSlug: string,
  offset: number
): Promise<ExerciseHistoryPage> => {
  const { data } = await publicApi().GET("/v1/workout-session-exercises", {
    params: {
      query: {
        exercise_slug: exerciseSlug,
        limit: EXERCISE_HISTORY_PAGE_SIZE,
        offset,
      },
    },
  });
  if (!data) {
    throw new ApiError("Public API answered without an Exercise history");
  }
  return data;
};

/**
 * The User's history for an Exercise, a page of `EXERCISE_HISTORY_PAGE_SIZE`
 * entries at a time as the screen scrolls near its end, newest Workout
 * Session first. A failed refresh keeps the pages already read; with none
 * read the view shows its load error, and a 429 the wait (it is never
 * retried, so the User waits it out).
 */
export const useExerciseHistoryQuery = createInfiniteQuery<
  ExerciseHistoryPage,
  ExerciseHistoryVariables
>({
  fetcher: ({ exerciseSlug }: ExerciseHistoryVariables, { pageParam }) =>
    fetchExerciseHistory(exerciseSlug, pageParam),
  // An empty page ends the paging whatever it says: its offset would repeat.
  getNextPageParam: (lastPage, _pages, lastOffset) =>
    lastPage.hasMore && lastPage.data.length > 0
      ? lastOffset + lastPage.data.length
      : undefined,
  initialPageParam: 0,
  queryKey: EXERCISE_HISTORY_QUERY_KEY,
  // A 429 is the User's to wait out; the view offers Try again.
  retry: false,
});
