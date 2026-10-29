import type { AppLanguage, MuscleGroup } from "@fitme/core";
import {
  type Exercise,
  type ExercisePage,
  type ExerciseSummary,
  exerciseNameFromSlug,
  type Library,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
} from "@fitme/library-sdk";
import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAppLanguage } from "~/lib/i18n";
import { getLibrary } from "~/lib/library";
import {
  readCachedExercise,
  readCachedSummary,
  removeCachedExercise,
  writeCachedExercise,
  writeCachedSummary,
} from "~/lib/library-cache";

/** In line with the API's `Cache-Control: private, max-age=3600`. */
export const EXERCISE_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * What a row shows for an Exercise: the Library's details once
 * resolved, otherwise (never resolved, or unknown to the library) a name made
 * from its slug, no muscle groups, no media and no detail screen.
 */
export interface ShownExercise {
  /** Whether the Library knows it, so its detail screen can open. */
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

type Batch = Map<string, Waiter[]>;

/**
 * The slugs waiting for their next `lookup`, per Library client and App
 * language: a batch goes out through the client its slugs were asked for
 * under, even if `getLibrary()` answers another one by the time it's sent,
 * and in the language they were asked in.
 */
const waiting = new Map<Library, Map<AppLanguage, Batch>>();

/** Answers every slug of `batch` with one `lookup` through `library`. */
const flush = async (library: Library, language: AppLanguage, batch: Batch) => {
  waiting.get(library)?.delete(language);
  try {
    const { data } = await library.lookup([...batch.keys()], { language });
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

/** A new batch for `library` in `language`, sent on the next tick. */
const openBatch = (library: Library, language: AppLanguage): Batch => {
  const batch: Batch = new Map();
  const batches = waiting.get(library) ?? new Map<AppLanguage, Batch>();
  batches.set(language, batch);
  waiting.set(library, batches);
  setTimeout(() => flush(library, language, batch), 0);
  return batch;
};

/**
 * One Exercise's summary in `language`, or `null` when the Library has no
 * such slug. Slugs asked for in the same tick and language (every row of a
 * screen) share one `lookup`, which the client splits into requests of 40.
 */
const lookupExercise = (language: AppLanguage, slug: string) =>
  new Promise<ExerciseSummary | null>((resolve, reject) => {
    const library = getLibrary();
    const batch =
      waiting.get(library)?.get(language) ?? openBatch(library, language);
    batch.set(slug, [...(batch.get(slug) ?? []), { reject, resolve }]);
  });

/**
 * One retry, and none for an answer a retry won't change (or, rate limited,
 * would only make worse): each slug retries on its own, outside the batch.
 */
const retryOnce = (failureCount: number, error: unknown) =>
  failureCount < 1 &&
  !(
    error instanceof LibraryRateLimitedError ||
    error instanceof LibraryUnauthorizedError ||
    error instanceof LibraryInvalidRequestError
  );

/**
 * Every Exercise query is keyed by the App language too, so a new language
 * refetches and never shows another language's copy.
 */
const summaryKey = (language: AppLanguage, slug: string) => [
  "exercise-summary",
  language,
  slug,
];

const exerciseSummaryQuery = (language: AppLanguage, slug: string) =>
  queryOptions({
    // A cached Exercise shows at once (offline too) and is refreshed once stale.
    initialData: () => readCachedSummary(language, slug)?.value,
    initialDataUpdatedAt: () => readCachedSummary(language, slug)?.savedAt,
    queryFn: async (): Promise<ExerciseSummary | null> => {
      const exercise = await lookupExercise(language, slug);
      if (exercise) {
        writeCachedSummary(language, exercise);
      } else {
        removeCachedExercise(slug);
      }
      return exercise;
    },
    queryKey: summaryKey(language, slug),
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });

/**
 * The Exercises with these slugs, by slug, as rows show them, in the App
 * language (wholly English for one without a translation). Never waits:
 * a slug not resolved yet (or that fails to) shows its slug's name, and its
 * row fills in once the Library answers.
 */
export const useExercises = (
  slugs: readonly string[]
): Record<string, ShownExercise> => {
  // An empty slug (a malformed row) never resolves: it isn't asked for.
  const unique = [...new Set(slugs)].filter(Boolean);
  const language = useAppLanguage();
  const results = useQueries({
    queries: unique.map((slug) => exerciseSummaryQuery(language, slug)),
  });
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
 * One Exercise in full, in the App language, for its detail screen and
 * guide: `null` when the
 * Library has no such slug. Starts from the cached copy (offline too).
 * Without a slug (not known yet) it asks nothing.
 */
export const useExerciseDetailQuery = (slug: string) => {
  const queryClient = useQueryClient();
  const language = useAppLanguage();
  return useQuery({
    enabled: slug.length > 0,
    initialData: () => readCachedExercise(language, slug)?.value,
    initialDataUpdatedAt: () => readCachedExercise(language, slug)?.savedAt,
    queryFn: async (): Promise<Exercise | null> => {
      const exercise = await getLibrary().get(slug, { language });
      if (exercise) {
        writeCachedExercise(language, exercise);
      } else {
        removeCachedExercise(slug);
      }
      // Rows showing this Exercise follow what its detail screen just read.
      queryClient.setQueryData<ExerciseSummary | null>(
        summaryKey(language, slug),
        exercise
      );
      return exercise;
    },
    queryKey: ["exercise-detail", language, slug],
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
 * The Library, searched and filtered, a page at a time: what the
 * Library tab and the Exercise picker list. A changed search is sent
 * `EXERCISE_SEARCH_DEBOUNCE_MS` after the last keystroke, a changed muscle
 * group at once. Rate limited, it keeps the last results (no error) and holds
 * the next request (a search, the next page, a refresh) back until
 * `Retry-After` has passed. Every Exercise it
 * lists is seeded into its row query and MMKV, so its detail screen has its
 * name at once and it shows offline.
 */
/**
 * When the User may call `list` again after a 429, kept in the query client
 * so the Library tab and the Exercise picker share it.
 */
const rateLimitKey = ["exercise-search-rate-limited-until"];

/** Resolves once `until` has passed; rejects if the request is cancelled first. */
const waitUntil = (until: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const wait = until - Date.now();
    if (wait <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, wait);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

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
  const [lastPages, setLastPages] = useState<ExercisePage[]>();

  useEffect(() => {
    if (sent.search === term && sent.muscleGroup === muscleGroup) {
      return;
    }
    // A new muscle group is one tap: it goes out at once, with any typed search.
    const debounce =
      sent.muscleGroup === muscleGroup ? EXERCISE_SEARCH_DEBOUNCE_MS : 0;
    const timer = setTimeout(
      () => setSent({ muscleGroup, search: term }),
      debounce
    );
    return () => clearTimeout(timer);
  }, [muscleGroup, sent, term]);

  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: ExercisePage, _pages, lastOffset: number) =>
      lastPage.hasMore ? lastOffset + EXERCISE_SEARCH_PAGE_SIZE : undefined,
    initialPageParam: 0,
    // A new search keeps showing the last results until its own arrive.
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam, signal }): Promise<ExercisePage> => {
      // Every request (a search, the next page, a refresh) waits out a 429.
      await waitUntil(
        queryClient.getQueryData<number>(rateLimitKey) ?? 0,
        signal
      );
      let page: ExercisePage;
      try {
        page = await getLibrary().list({
          limit: EXERCISE_SEARCH_PAGE_SIZE,
          offset: pageParam,
          ...(sent.search ? { search: sent.search } : {}),
          ...(sent.muscleGroup ? { muscleGroup: sent.muscleGroup } : {}),
        });
      } catch (error) {
        if (error instanceof LibraryRateLimitedError) {
          queryClient.setQueryData<number>(
            rateLimitKey,
            Date.now() + error.retryAfterSeconds * 1000
          );
        }
        throw error;
      }
      // Search is English for now (FIT-408), so it seeds the English copies.
      for (const exercise of page.data) {
        writeCachedSummary("en", exercise);
        queryClient.setQueryData<ExerciseSummary | null>(
          summaryKey("en", exercise.slug),
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

  const isRateLimited = query.error instanceof LibraryRateLimitedError;
  // Rate limited, the last results stay; with none to show it's an error.
  const shownPages =
    query.data?.pages ?? (isRateLimited ? lastPages : undefined);

  return {
    exercises: shownPages?.flatMap((page) => page.data),
    hasMore: query.hasNextPage && !query.isPlaceholderData,
    /**
     * The search (or a refresh of it) failed, rate limited aside: the view's
     * error state, whatever it showed before.
     */
    isError:
      query.isError &&
      !query.isFetchNextPageError &&
      !(isRateLimited && shownPages),
    isLoadingMore: query.isFetchingNextPage,
    /** The next page failed (rate limited aside): the results stay, with a message. */
    isLoadMoreError: query.isFetchNextPageError && !isRateLimited,
    loadMore: query.fetchNextPage,
    refetch: query.refetch,
  };
};
