import type { MuscleGroup } from "@fitme/core";
import {
  type Exercise,
  type ExerciseSummary,
  exerciseNameFromSlug,
} from "@fitme/exercise-library";
import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
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
    queryKey: ["exercise-summary", slug],
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
  const unique = [...new Set(slugs)];
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
export const useExerciseDetailQuery = (slug: string) =>
  useQuery({
    initialData: () => readCachedExercise(slug)?.value,
    initialDataUpdatedAt: () => readCachedExercise(slug)?.savedAt,
    queryFn: async (): Promise<Exercise | null> => {
      const exercise = await exerciseLibrary.get(slug);
      if (exercise) {
        writeCachedExercise(exercise);
      } else {
        removeCachedExercise(slug);
      }
      return exercise;
    },
    queryKey: ["exercise-detail", slug],
    staleTime: EXERCISE_STALE_TIME_MS,
  });
