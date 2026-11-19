import { appLanguages } from "@fitme/core";
import type { AppLanguage } from "@fitme/core";
import type { Cover } from "@fitme/library-sdk";
import { z } from "zod";

import type { Exercise, ExerciseSummary } from "~/lib/exercises";
import { storage } from "~/lib/mmkv";

// The Exercises the app has resolved, kept in MMKV so they show offline and
// right after a restart. Library content is the same for every User, so it
// isn't kept per User, but it is kept per App language
// (`exercises.<language>.summary.<slug>` and `exercises.<language>.detail.<slug>`),
// so each language shows its own copy. Each entry is kept under the slug it
// was asked for, which for a replaced slug (ADR 0022) holds the Exercise
// replacing it. Each entry carries when it was saved, so a query starting
// from it knows whether it's stale. The Covers are one list under one key
// (`library.covers`): they still come from the Library API, and have no text,
// so no language.

const summaryStorageKey = (language: AppLanguage, slug: string) =>
  `exercises.${language}.summary.${slug}`;

const exerciseStorageKey = (language: AppLanguage, slug: string) =>
  `exercises.${language}.detail.${slug}`;

const COVERS_STORAGE_KEY = "library.covers";

/** Set once the Legacy Library's copies have been swept off this install. */
const LEGACY_SWEPT_KEY = "exercises.legacy-copies-swept";

/** `library.<language>.exercise-summary.<slug>` and `library.<language>.exercise.<slug>`. */
const LEGACY_EXERCISE_KEY = /^library\.[^.]+\.exercise(?:-summary)?\./u;

/**
 * Removes every copy a build reading the Legacy Library kept (its shape is
 * not the new Library's), once per install: the flag stays set afterwards,
 * so later reads cost one boolean.
 */
export const sweepLegacyExerciseCopies = () => {
  if (storage.getBoolean(LEGACY_SWEPT_KEY)) {
    return;
  }

  for (const key of storage.getAllKeys()) {
    if (LEGACY_EXERCISE_KEY.test(key)) {
      storage.remove(key);
    }
  }

  storage.set(LEGACY_SWEPT_KEY, true);
};

export interface CachedEntry<T> {
  savedAt: number;
  value: T;
}

// Lists and Difficulty as plain strings: an id a later Library added (which
// this build shows as itself) mustn't cost the copy its whole Screen offline.
const summarySchema = z.object({
  difficulty: z.string(),
  equipment: z.array(z.string()),
  movement_patterns: z.array(z.string()),
  muscle_groups: z.array(z.string()),
  name: z.string(),
  secondary_muscle_groups: z.array(z.string()),
  slug: z.string(),
  thumbnail_url: z.string(),
  video_url: z.string(),
});

const exerciseSchema = summarySchema.extend({
  benefits: z.array(z.string()),
  common_mistakes: z.array(z.string()),
  long_description: z.string(),
  short_description: z.string(),
  steps: z.array(z.string()),
});

const coverSchema = z.object({
  id: z.string(),
  image_url: z.string(),
  muscle_groups: z.array(z.string()),
});

const isSummary = (value: unknown): value is ExerciseSummary =>
  summarySchema.safeParse(value).success;

const isExercise = (value: unknown): value is Exercise =>
  exerciseSchema.safeParse(value).success;

const isCoverList = (value: unknown): value is Cover[] =>
  z.array(coverSchema).safeParse(value).success;

const savedAtSchema = z.union([
  z.number(),
  z.literal(Number.POSITIVE_INFINITY),
  z.literal(Number.NEGATIVE_INFINITY),
]);

/** The entry under `key`; an unreadable or malformed value counts as none. */
const read = <T>(
  key: string,
  isValue: (value: unknown) => value is T
): CachedEntry<T> | undefined => {
  sweepLegacyExerciseCopies();
  const raw = storage.getString(key);

  if (!raw) {
    return;
  }

  let entry: unknown;

  try {
    entry = JSON.parse(raw);
  } catch {
    return;
  }

  const parsed = z
    .object({ savedAt: savedAtSchema, value: z.custom<T>(isValue) })
    .safeParse(entry);

  if (parsed.success) {
    return { savedAt: parsed.data.savedAt, value: parsed.data.value };
  }
};

const write = <T>(key: string, value: T, savedAt: number) => {
  sweepLegacyExerciseCopies();
  storage.set(key, JSON.stringify({ savedAt, value }));
};

/** The summary kept for the slug asked for, in `language`. */
export const readCachedSummary = (language: AppLanguage, slug: string) =>
  read(summaryStorageKey(language, slug), isSummary);

/** The Exercise in full kept for the slug asked for, in `language`. */
export const readCachedExercise = (language: AppLanguage, slug: string) =>
  read(exerciseStorageKey(language, slug), isExercise);

const summaryOf = ({
  difficulty,
  equipment: needed,
  movement_patterns,
  muscle_groups,
  name,
  secondary_muscle_groups,
  slug,
  thumbnail_url,
  video_url,
}: ExerciseSummary): ExerciseSummary => ({
  difficulty,
  equipment: needed,
  movement_patterns,
  muscle_groups,
  name,
  secondary_muscle_groups,
  slug,
  thumbnail_url,
  video_url,
});

/**
 * Keeps `exercise`'s summary under `requestedSlug` (the slug asked for,
 * `exercise.slug` unless it was replaced).
 */
export const writeCachedSummary = (
  language: AppLanguage,
  exercise: ExerciseSummary,
  { requestedSlug = exercise.slug, savedAt = Date.now() } = {}
) =>
  write(
    summaryStorageKey(language, requestedSlug),
    summaryOf(exercise),
    savedAt
  );

/** Keeps the Exercise in full, and its summary for the rows that show it. */
export const writeCachedExercise = (
  language: AppLanguage,
  exercise: Exercise,
  { requestedSlug = exercise.slug, savedAt = Date.now() } = {}
) => {
  const {
    benefits,
    common_mistakes,
    long_description,
    short_description,
    steps,
  } = exercise;

  write(
    exerciseStorageKey(language, requestedSlug),
    {
      ...summaryOf(exercise),
      benefits,
      common_mistakes,
      long_description,
      short_description,
      steps,
    },
    savedAt
  );
  writeCachedSummary(language, exercise, { requestedSlug, savedAt });
};

/** Forgets a slug the Library no longer has, in every App language. */
export const removeCachedExercise = (slug: string) => {
  for (const language of appLanguages) {
    storage.remove(summaryStorageKey(language, slug));
    storage.remove(exerciseStorageKey(language, slug));
  }
};

export const readCachedCovers = () => read(COVERS_STORAGE_KEY, isCoverList);

export const writeCachedCovers = (
  covers: readonly Cover[],
  savedAt = Date.now()
) =>
  write(
    COVERS_STORAGE_KEY,
    covers.map(({ id, image_url, muscle_groups }) => ({
      id,
      image_url,
      muscle_groups,
    })),
    savedAt
  );
