import type { MuscleGroup } from "@fitme/core";
import {
  type Exercise,
  ExerciseLibraryInvalidRequestError,
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnauthorizedError,
  type ExercisePage,
  type ExerciseSummary,
  exerciseNameFromSlug,
} from "@fitme/exercise-library";
import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  readCachedExercise,
  readCachedSummary,
  removeCachedExercise,
  writeCachedExercise,
  writeCachedSummary,
} from "~/lib/exercise-cache";
import { exerciseLibrary } from "~/lib/exercise-library";

/** In line with the API's `Cache-Control: private, max-age=3600`. */
export const EXERCISE_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * What a row shows for an Exercise: the Exercise Library's details once
 * resolved, otherwise (never resolved, or unknown to the library) a name made
 * from its slug, no muscle groups, no media and no detail screen.
 */
export interface ShownExercise {
  /** Whether the Exercise Library knows it, so its detail screen can open. */
  isResolved: boolean;
  muscle_groups: MuscleGroup[];
  name: string;
  slug: string;
  thumbnail_url: string | null;
  video_url: string | null;
}

export const shownExercise = (
  slug: string,
  exercise: ExerciseSummary | null | undefined
): ShownExercise =>
  exercise
    ? {
        isResolved: true,
        muscle_groups: exercise.muscle_groups,
        name: exercise.name,
        slug,
        thumbnail_url: exercise.thumbnail_url || null,
        video_url: exercise.video_url || null,
      }
    : {
        isResolved: false,
        muscle_groups: [],
        name: exerciseNameFromSlug(slug),
        slug,
        thumbnail_url: null,
        video_url: null,
      };

interface Waiter {
  reject: (error: unknown) => void;
  resolve: (exercise: ExerciseSummary | null) => void;
}

let waiting = new Map<string, Waiter[]>();
let flushScheduled = false;

/** Answers every slug asked for since the last flush with one `lookup`. */
const flush = async () => {
  flushScheduled = false;
  const batch = waiting;
  waiting = new Map();
  try {
    const { data } = await exerciseLibrary.lookup([...batch.keys()]);
    const found = new Map(data.map((exercise) => [exercise.slug, exercise]));
    for (const [slug, waiters] of batch) {
      for (const { resolve } of waiters) {
        resolve(found.get(slug) ?? null);
      }
    }
  } catch (error) {
    for (const waiters of batch.values()) {
      for (const { reject } of waiters) {
        reject(error);
      }
    }
  }
};

/**
 * One Exercise's summary, or `null` when the Exercise Library has no such
 * slug. Slugs asked for in the same tick (every row of a screen) share one
 * `lookup`, which the client splits into requests of 40.
 */
const lookupExercise = (slug: string) =>
  new Promise<ExerciseSummary | null>((resolve, reject) => {
    waiting.set(slug, [...(waiting.get(slug) ?? []), { reject, resolve }]);
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(flush, 0);
    }
  });

/**
 * One retry, and none for an answer a retry won't change (or, rate limited,
 * would only make worse): each slug retries on its own, outside the batch.
 */
const retryOnce = (failureCount: number, error: unknown) =>
  failureCount < 1 &&
  !(
    error instanceof ExerciseLibraryRateLimitedError ||
    error instanceof ExerciseLibraryUnauthorizedError ||
    error instanceof ExerciseLibraryInvalidRequestError
  );

const summaryKey = (slug: string) => ["exercise-summary", slug];

const exerciseSummaryQuery = (slug: string) =>
  queryOptions({
    // A cached Exercise shows at once (offline too) and is refreshed once stale.
    initialData: () => readCachedSummary(slug)?.value,
    initialDataUpdatedAt: () => readCachedSummary(slug)?.savedAt,
    queryFn: async (): Promise<ExerciseSummary | null> => {
      const exercise = await lookupExercise(slug);
      if (exercise) {
        writeCachedSummary(exercise);
      } else {
        removeCachedExercise(slug);
      }
      return exercise;
    },
    queryKey: summaryKey(slug),
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });

/**
 * The Exercises with these slugs, by slug, as rows show them. Never waits:
 * a slug not resolved yet (or that fails to) shows its slug's name, and its
 * row fills in once the Exercise Library answers.
 */
export const useExercises = (
  slugs: readonly string[]
): Record<string, ShownExercise> => {
  // An empty slug (a malformed row) never resolves: it isn't asked for.
  const unique = [...new Set(slugs)].filter(Boolean);
  const results = useQueries({ queries: unique.map(exerciseSummaryQuery) });
  const shown: Record<string, ShownExercise> = {};
  unique.forEach((slug, index) => {
    shown[slug] = shownExercise(slug, results[index]?.data);
  });
  return shown;
};

/** One Exercise as a row shows it (see `useExercises`); none asked for without a slug. */
export const useExercise = (slug: string | undefined): ShownExercise => {
  const shown = useExercises(slug ? [slug] : []);
  return (slug && shown[slug]) || shownExercise(slug ?? "", null);
};

/**
 * One Exercise in full, for its detail screen and guide: `null` when the
 * Exercise Library has no such slug. Starts from the cached copy (offline too).
 */
export const useExerciseDetailQuery = (slug: string) => {
  const queryClient = useQueryClient();
  return useQuery({
    initialData: () => readCachedExercise(slug)?.value,
    initialDataUpdatedAt: () => readCachedExercise(slug)?.savedAt,
    queryFn: async (): Promise<Exercise | null> => {
      const exercise = await exerciseLibrary.get(slug);
      if (exercise) {
        writeCachedExercise(exercise);
      } else {
        removeCachedExercise(slug);
      }
      // Rows showing this Exercise follow what its detail screen just read.
      queryClient.setQueryData<ExerciseSummary | null>(
        summaryKey(slug),
        exercise
      );
      return exercise;
    },
    queryKey: ["exercise-detail", slug],
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });
};

/** Results per page of the Library tab and the Exercise picker. */
export const EXERCISE_SEARCH_PAGE_SIZE = 20;

/** Search waits this long after the last keystroke (120 requests a minute per User). */
export const EXERCISE_SEARCH_DEBOUNCE_MS = 300;

interface ExerciseSearchParams {
  muscleGroup?: MuscleGroup;
  search: string;
}

/**
 * The Exercise Library, searched and filtered, a page at a time: what the
 * Library tab and the Exercise picker list. A changed search is sent
 * `EXERCISE_SEARCH_DEBOUNCE_MS` after the last keystroke, a changed muscle
 * group at once. Rate limited, it keeps the last results (no error) and holds
 * the next search back until `Retry-After` has passed. Every Exercise it
 * lists is seeded into its row query and MMKV, so its detail screen has its
 * name at once and it shows offline.
 */
export const useExerciseSearch = ({
  muscleGroup,
  search,
}: ExerciseSearchParams) => {
  const queryClient = useQueryClient();
  const term = search.trim();
  const [sent, setSent] = useState<ExerciseSearchParams>({
    muscleGroup,
    search: term,
  });
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [lastPages, setLastPages] = useState<ExercisePage[]>();

  useEffect(() => {
    if (sent.search === term && sent.muscleGroup === muscleGroup) {
      return;
    }
    const debounce = sent.search === term ? 0 : EXERCISE_SEARCH_DEBOUNCE_MS;
    const timer = setTimeout(
      () => setSent({ muscleGroup, search: term }),
      Math.max(debounce, rateLimitedUntil - Date.now())
    );
    return () => clearTimeout(timer);
  }, [muscleGroup, rateLimitedUntil, sent, term]);

  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: ExercisePage, _pages, lastOffset: number) =>
      lastPage.hasMore ? lastOffset + EXERCISE_SEARCH_PAGE_SIZE : undefined,
    initialPageParam: 0,
    // A new search keeps showing the last results until its own arrive.
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<ExercisePage> => {
      let page: ExercisePage;
      try {
        page = await exerciseLibrary.list({
          limit: EXERCISE_SEARCH_PAGE_SIZE,
          offset: pageParam,
          ...(sent.search ? { search: sent.search } : {}),
          ...(sent.muscleGroup ? { muscleGroup: sent.muscleGroup } : {}),
        });
      } catch (error) {
        if (error instanceof ExerciseLibraryRateLimitedError) {
          setRateLimitedUntil(Date.now() + error.retryAfterSeconds * 1000);
        }
        throw error;
      }
      for (const exercise of page.data) {
        writeCachedSummary(exercise);
        queryClient.setQueryData<ExerciseSummary | null>(
          summaryKey(exercise.slug),
          exercise
        );
      }
      return page;
    },
    queryKey: ["exercise-search", sent.search, sent.muscleGroup ?? null],
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });

  const pages = query.isPlaceholderData ? undefined : query.data?.pages;
  useEffect(() => {
    if (pages) {
      setLastPages(pages);
    }
  }, [pages]);

  const isRateLimited = query.error instanceof ExerciseLibraryRateLimitedError;
  // Rate limited, the last results stay; with none to show it's an error.
  const shownPages =
    query.data?.pages ?? (isRateLimited ? lastPages : undefined);

  return {
    exercises: shownPages?.flatMap((page) => page.data),
    hasMore: query.hasNextPage && !query.isPlaceholderData,
    isError: query.isError && !(isRateLimited && shownPages),
    isLoadingMore: query.isFetchingNextPage,
    loadMore: query.fetchNextPage,
    refetch: query.refetch,
  };
};
