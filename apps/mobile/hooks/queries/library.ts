import { ApiError, rateLimitedFor } from "@fitme/api-client";
import type { paths } from "@fitme/api-client";
import { defaultAppLanguage, MAX_EXERCISE_SLUG_LENGTH } from "@fitme/core";
import type {
  AppLanguage,
  Equipment,
  LegacyEquipment,
  LegacyMuscleGroup,
  MuscleGroup,
} from "@fitme/core";
import {
  exerciseNameFromSlug,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
} from "@fitme/library-sdk";
import type { Cover } from "@fitme/library-sdk";
import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { equipmentInCoreOrder } from "~/hooks/equipment-choice";
import { inCoreOrder } from "~/hooks/muscle-choice";
import type { Exercise, ExercisePage, ExerciseSummary } from "~/lib/exercises";
import { useAppLanguage } from "~/lib/i18n";
import { getLibrary } from "~/lib/library";
import {
  readCachedCovers,
  readCachedExercise,
  readCachedSummary,
  removeCachedExercise,
  writeCachedCovers,
  writeCachedExercise,
  writeCachedSummary,
} from "~/lib/library-cache";
import { publicApi } from "~/lib/public-api";

/** In line with the API's `Cache-Control: private, max-age=3600`. */
export const EXERCISE_STALE_TIME_MS = 60 * 60 * 1000;

/** The query `GET /v1/exercises` takes. */
type ExercisesQuery = NonNullable<
  paths["/v1/exercises"]["get"]["parameters"]["query"]
>;

/** `GET /v1/exercises?slugs=` takes at most this many slugs. */
const MAX_LOOKUP_SLUGS = 40;

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
  /**
   * The Exercise's own slug, which its detail screen opens under: the one
   * replacing a replaced slug (ADR 0022), else the slug asked for.
   */
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
        slug: exercise.slug,
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
  reject: (error: Error) => void;
  resolve: (exercise: ExerciseSummary | null) => void;
}

type Batch = Map<string, Waiter[]>;

/**
 * The slugs waiting for their next lookup, per App language: a batch goes
 * out in the language its slugs were asked in.
 */
const waiting = new Map<AppLanguage, Batch>();

/** One `GET /v1/exercises?slugs=` of at most `MAX_LOOKUP_SLUGS` slugs. */
const lookupChunk = async (language: AppLanguage, slugs: string[]) => {
  const query: ExercisesQuery = { slugs: slugs.join(",") };

  // English is the API's default.
  if (language !== defaultAppLanguage) {
    query.language = language;
  }

  const { data } = await publicApi().GET("/v1/exercises", {
    params: { query },
  });

  if (!(data && "missing" in data)) {
    throw new ApiError("Public API answered without an Exercise lookup");
  }

  return data.data;
};

/** Whether the API takes `slug` in `?slugs=` or a path, as its schemas do. */
const isAskableSlug = (slug: string) =>
  slug.length <= MAX_EXERCISE_SLUG_LENGTH && !slug.includes(",");

/** Answers every slug of `batch` with one lookup, split into requests of 40. */
const flush = async (language: AppLanguage, batch: Batch) => {
  waiting.delete(language);
  // A slug with a comma would split into two, and one over the bound fails
  // the whole request: neither is ever an Exercise's, so each is missing.
  const slugs = [...batch.keys()].filter(isAskableSlug);
  const chunks: string[][] = [];

  for (let start = 0; start < slugs.length; start += MAX_LOOKUP_SLUGS) {
    chunks.push(slugs.slice(start, start + MAX_LOOKUP_SLUGS));
  }

  try {
    const answers = await Promise.all(
      chunks.map((chunk) => lookupChunk(language, chunk))
    );

    // By the slug asked for, so a replaced one finds the Exercise replacing it.
    const found = new Map(
      answers
        .flat()
        .map(({ requested_slug, ...exercise }) => [requested_slug, exercise])
    );

    for (const [slug, waiters] of batch) {
      for (const { resolve } of waiters) {
        resolve(found.get(slug) ?? null);
      }
    }
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : new Error("Exercise lookup failed", { cause: error });

    for (const waiters of batch.values()) {
      for (const { reject } of waiters) {
        reject(failure);
      }
    }
  }
};

/** A new batch in `language`, sent on the next tick. */
const openBatch = (language: AppLanguage): Batch => {
  const batch: Batch = new Map();
  waiting.set(language, batch);
  setTimeout(() => {
    void flush(language, batch);
  }, 0);

  return batch;
};

/**
 * One Exercise's summary in `language` (the one replacing a replaced slug),
 * or `null` when the Library has no such slug. Slugs asked for in the same
 * tick and language (every row of a screen) share one lookup.
 */
const lookupExercise = async (language: AppLanguage, slug: string) => {
  const { promise, resolve, reject } =
    Promise.withResolvers<ExerciseSummary | null>();

  const batch = waiting.get(language) ?? openBatch(language);
  batch.set(slug, [...(batch.get(slug) ?? []), { reject, resolve }]);

  return await promise;
};

/** Answers a retry won't change (or, rate limited, would only make worse). */
const NO_RETRY_STATUSES = new Set([400, 401, 429]);

/**
 * One retry, and none for an answer a retry won't change: each slug retries
 * on its own, outside the batch.
 */
const retryOnce = (failureCount: number, error: Error) =>
  failureCount < 1 &&
  !(error instanceof ApiError && NO_RETRY_STATUSES.has(error.status ?? 0));

/** The Covers' retry, over the Library API's errors. */
const retryCoversOnce = (failureCount: number, error: Error) =>
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
const summaryQueryKey = (language: AppLanguage, slug: string) => [
  "exercise-summary",
  language,
  slug,
];

const detailQueryKey = (language: AppLanguage, slug: string) => [
  "exercise-detail",
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
        writeCachedSummary(language, exercise, { requestedSlug: slug });
      } else {
        removeCachedExercise(slug);
      }

      return exercise;
    },
    queryKey: summaryQueryKey(language, slug),
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });

/**
 * The Exercises with these slugs, by the slug asked for, as rows show them,
 * in the App language (wholly English for one without a translation). A
 * replaced slug (ADR 0022) shows the Exercise replacing it, under that
 * Exercise's own `slug`. Never waits: a slug not resolved yet (or that fails
 * to) shows its slug's name, and its row fills in once the Public API answers.
 */
export const useExercises = (slugs: readonly string[]) => {
  // An empty slug (a malformed row) never resolves: it isn't asked for.
  const unique = [...new Set(slugs)].filter(Boolean);
  const language = useAppLanguage();

  const results = useQueries({
    queries: unique.map((slug) => exerciseSummaryQuery(language, slug)),
  });

  const shown: Record<string, ShownExercise> = {};

  for (const [index, slug] of unique.entries()) {
    shown[slug] = shownExercise(slug, results[index]?.data);
  }

  return shown;
};

/** One Exercise as a row shows it (see `useExercises`); none asked for without a slug. */
export const useExercise = (slug: string | undefined): ShownExercise => {
  const shown = useExercises(slug ? [slug] : []);

  return (slug ? shown[slug] : undefined) ?? shownExercise(slug ?? "", null);
};

/**
 * One Exercise in full through `GET /v1/exercises/{slug}`: the one replacing
 * a replaced slug, `null` for the API's 404.
 */
const fetchExercise = async (
  language: AppLanguage,
  slug: string
): Promise<Exercise | null> => {
  // One the path schema refuses is never an Exercise's: gone, like a 404.
  if (!isAskableSlug(slug)) {
    return null;
  }

  try {
    const { data } = await publicApi().GET("/v1/exercises/{slug}", {
      params: {
        path: { slug },
        query: language === defaultAppLanguage ? {} : { language },
      },
    });

    if (!data) {
      throw new ApiError("Public API answered without an Exercise");
    }

    return data.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
};

/**
 * One Exercise in full, in the App language, for its detail screen and
 * guide: `null` when the Library has no such slug, the one replacing it for
 * a replaced slug. Starts from the cached copy (offline too). Without a slug
 * (not known yet) it asks nothing.
 */
export const useExerciseDetailQuery = (slug: string) => {
  const queryClient = useQueryClient();
  const language = useAppLanguage();

  return useQuery({
    enabled: slug.length > 0,
    initialData: () => readCachedExercise(language, slug)?.value,
    initialDataUpdatedAt: () => readCachedExercise(language, slug)?.savedAt,
    queryFn: async (): Promise<Exercise | null> => {
      const exercise = await fetchExercise(language, slug);

      if (exercise) {
        writeCachedExercise(language, exercise, { requestedSlug: slug });
      } else {
        removeCachedExercise(slug);
      }

      // Rows showing this Exercise follow what its detail screen just read.
      queryClient.setQueryData<ExerciseSummary | null>(
        summaryQueryKey(language, slug),
        exercise
      );

      // A replaced slug's answer is its replacement's too: its guide opens
      // under that slug and has it at once, offline included.
      if (exercise && exercise.slug !== slug) {
        queryClient.setQueryData<ExerciseSummary>(
          summaryQueryKey(language, exercise.slug),
          exercise
        );
        queryClient.setQueryData<Exercise>(
          detailQueryKey(language, exercise.slug),
          exercise
        );
      }

      return exercise;
    },
    queryKey: detailQueryKey(language, slug),
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });
};

const NO_COVERS: ReadonlyMap<string, Cover> = new Map();

const coversById = (covers: Cover[]): ReadonlyMap<string, Cover> =>
  new Map(covers.map((cover) => [cover.id, cover]));

/**
 * The Library's Covers, by id: every Cover a Workout card can show, still
 * from the Library API (ADR 0022). Starts from the copy kept in MMKV
 * (offline too, and right after a restart) and is refreshed once stale.
 * Never waits: until the list arrives, and when it never does, no Cover is
 * known. A failed refresh (a 429 included) keeps the last list.
 */
export const useCovers = (): ReadonlyMap<string, Cover> => {
  const { data } = useQuery({
    initialData: () => readCachedCovers()?.value,
    initialDataUpdatedAt: () => readCachedCovers()?.savedAt,
    queryFn: async (): Promise<Cover[]> => {
      const covers = await getLibrary().covers();
      writeCachedCovers(covers);

      return covers;
    },
    queryKey: ["covers"],
    retry: retryCoversOnce,
    select: coversById,
    staleTime: EXERCISE_STALE_TIME_MS,
  });

  return data ?? NO_COVERS;
};

/** Results per page of the Library tab and the Exercise picker. */
export const EXERCISE_SEARCH_PAGE_SIZE = 20;

/** Search waits this long after the last keystroke (the Public API's rate limit). */
export const EXERCISE_SEARCH_DEBOUNCE_MS = 300;

interface ExerciseSearchParams {
  /** Exercises needing any of it; none filters nothing. */
  equipment?: readonly LegacyEquipment[];
  /** Exercises working any of them; none is every Exercise. */
  muscleGroups: readonly LegacyMuscleGroup[];
  search: string;
}

/**
 * The new Library's muscle group a legacy choice asks for, until the Muscles
 * sheet offers the new list (FIT-757): the groups the new list folds in go to
 * the one that holds them.
 */
const LEGACY_MUSCLE_GROUPS: Record<LegacyMuscleGroup, MuscleGroup | null> = {
  abs: "core",
  back: "back",
  biceps: "biceps",
  calves: "calves",
  cardio: null,
  chest: "chest",
  forearms: "forearms",
  "full-body": null,
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "back",
  "lower-back": "lower-back",
  obliques: "core",
  quadriceps: "quadriceps",
  shoulders: "shoulders",
  traps: "traps",
  triceps: "triceps",
};

/** The same for a legacy Equipment choice, until the Equipment sheet's (FIT-757). */
const LEGACY_EQUIPMENT: Record<LegacyEquipment, Equipment> = {
  barbell: "barbell",
  bench: "bench",
  bodyweight: "bodyweight",
  cable: "cable",
  dumbbell: "dumbbell",
  landmine: "barbell",
  machine: "machine",
  pull_up_bar: "pull_up_bar",
  smith_machine: "machine",
};

const unique = <Value>(values: (Value | null)[]) => [
  ...new Set(values.filter((value): value is Value => value !== null)),
];

/** A stable default, so a screen without an Equipment pill never re-sends. */
const NO_EQUIPMENT: readonly LegacyEquipment[] = [];

/** One spelling per choice, in core's order, so it reuses its cache entry. */
const choiceKey = (chosen: readonly string[]) => chosen.join(",");

/**
 * When the User may list again after a 429, kept in the query client so the
 * Library tab and the Exercise picker share it.
 */
const rateLimitKey = ["exercise-search-rate-limited-until"];

/** Resolves once `until` has passed; rejects if the request is cancelled first. */
const waitUntil = async (until: number, signal: AbortSignal) => {
  const wait = until - Date.now();

  if (wait <= 0) {
    return;
  }

  const { promise, resolve, reject } = Promise.withResolvers<undefined>();
  const timer = setTimeout(() => resolve(undefined), wait);
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    reject(signal.reason);
  });

  await promise;
};

interface SentSearch {
  equipment: readonly LegacyEquipment[];
  groups: readonly LegacyMuscleGroup[];
  search: string;
}

/** One page of `GET /v1/exercises` for `sent`, in `language`. */
const listExercises = async (
  language: AppLanguage,
  sent: SentSearch,
  offset: number,
  signal: AbortSignal
): Promise<ExercisePage> => {
  const groups = unique(
    sent.groups.map((group) => LEGACY_MUSCLE_GROUPS[group])
  );

  const needed = unique(sent.equipment.map((item) => LEGACY_EQUIPMENT[item]));

  const query: ExercisesQuery = { limit: EXERCISE_SEARCH_PAGE_SIZE, offset };

  // English is the API's default.
  if (language !== defaultAppLanguage) {
    query.language = language;
  }

  if (sent.search) {
    query.search = sent.search;
  }

  if (groups.length > 0) {
    query.muscle_groups = groups.join(",");
  }

  if (needed.length > 0) {
    query.equipment = needed.join(",");
  }

  const { data } = await publicApi().GET("/v1/exercises", {
    params: { query },
    signal,
  });

  if (!(data && "total" in data)) {
    throw new ApiError("Public API answered without a page of Exercises");
  }

  return data;
};

/**
 * The Library, searched and filtered, a page at a time, in the App language,
 * through `GET /v1/exercises`: what the Library tab and the Exercise picker
 * list. Search matches the name in the App language, the English one or
 * another name, and results come in that language's alphabetical order. A
 * changed search is sent `EXERCISE_SEARCH_DEBOUNCE_MS` after the last
 * keystroke, a changed Muscle group, Equipment choice or App language at
 * once. Rate limited, it keeps the last results (no error) and holds the next
 * request (a search, the next page, a refresh) back until `Retry-After` has
 * passed. Every Exercise it lists is seeded into its row query and MMKV in
 * the language it was listed in, so its detail screen has its name at once
 * and it shows offline.
 */
export const useExerciseSearch = ({
  equipment = NO_EQUIPMENT,
  muscleGroups,
  search,
}: ExerciseSearchParams) => {
  const queryClient = useQueryClient();
  const language = useAppLanguage();
  const term = search.trim();
  const groupsKey = choiceKey(inCoreOrder(muscleGroups));
  const equipmentKey = choiceKey(equipmentInCoreOrder(equipment));

  const [sent, setSent] = useState<SentSearch>(() => ({
    equipment: equipmentInCoreOrder(equipment),
    groups: inCoreOrder(muscleGroups),
    search: term,
  }));

  const sameGroups = choiceKey(sent.groups) === groupsKey;
  const sameEquipment = choiceKey(sent.equipment) === equipmentKey;
  // A changed filter choice is one tap; only typing is debounced.
  const sameFilters = sameGroups && sameEquipment;

  const [lastPages, setLastPages] = useState<
    { language: AppLanguage; pages: ExercisePage[] } | undefined
  >(undefined);

  useEffect(() => {
    if (sent.search === term && sameFilters) {
      return;
    }

    // A new Muscle group or Equipment choice is one tap: it goes out at
    // once, with any typed search.
    const debounce = sameFilters ? EXERCISE_SEARCH_DEBOUNCE_MS : 0;

    const timer = setTimeout(
      () =>
        setSent({
          equipment: equipmentInCoreOrder(equipment),
          groups: inCoreOrder(muscleGroups),
          search: term,
        }),
      debounce
    );

    return () => clearTimeout(timer);
  }, [equipment, muscleGroups, sameFilters, sent, term]);

  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: ExercisePage, _pages, lastOffset: number) =>
      lastPage.hasMore ? lastOffset + EXERCISE_SEARCH_PAGE_SIZE : undefined,
    initialPageParam: 0,
    // A new search keeps showing the last results until its own arrive, but
    // never another language's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === language
        ? keepPreviousData(previous)
        : undefined,
    queryFn: async ({ pageParam, signal }): Promise<ExercisePage> => {
      // Every request (a search, the next page, a refresh) waits out a 429.
      await waitUntil(
        queryClient.getQueryData<number>(rateLimitKey) ?? 0,
        signal
      );
      let page: ExercisePage;

      try {
        page = await listExercises(language, sent, pageParam, signal);
      } catch (error) {
        const retryAfter = rateLimitedFor(error);

        if (retryAfter !== null) {
          queryClient.setQueryData<number>(
            rateLimitKey,
            Date.now() + retryAfter * 1000
          );
        }

        throw error;
      }

      for (const exercise of page.data) {
        writeCachedSummary(language, exercise);
        queryClient.setQueryData<ExerciseSummary | null>(
          summaryQueryKey(language, exercise.slug),
          exercise
        );
      }

      return page;
    },
    queryKey: [
      "exercise-search",
      language,
      sent.search,
      sent.groups,
      sent.equipment,
    ],
    retry: retryOnce,
    staleTime: EXERCISE_STALE_TIME_MS,
  });

  const pages = query.isPlaceholderData ? undefined : query.data?.pages;

  if (
    pages &&
    (lastPages?.pages !== pages || lastPages.language !== language)
  ) {
    setLastPages({ language, pages });
  }

  const isRateLimited = rateLimitedFor(query.error) !== null;

  // Rate limited, the last results in this language stay; with none to show
  // it's an error.
  const shownPages =
    query.data?.pages ??
    (isRateLimited && lastPages?.language === language
      ? lastPages.pages
      : undefined);

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
