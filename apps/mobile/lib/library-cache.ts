import { type AppLanguage, appLanguages } from "@fitme/core";
import type { Exercise, ExerciseSummary } from "@fitme/library-sdk";
import { storage } from "~/lib/mmkv";

// The Exercises the app has resolved, kept in MMKV so they show offline and
// right after a restart. Library content is the same for every User, so it
// isn't kept per User, but it is kept per App language
// (`library.<language>.exercise-summary.<slug>`), so each language shows its
// own copy. Each entry carries when it was saved, so a query starting from it
// knows whether it's stale.

const summaryKey = (language: AppLanguage, slug: string) =>
  `library.${language}.exercise-summary.${slug}`;
const exerciseKey = (language: AppLanguage, slug: string) =>
  `library.${language}.exercise.${slug}`;

// Builds before the App language kept English copies under
// `library.exercise-summary.*` / `library.exercise.*`. Those are deleted once
// per install, on first use, and refetched under the language's keys.
const LEGACY_PREFIXES = ["library.exercise-summary.", "library.exercise."];
const LEGACY_SWEPT_KEY = "library.untranslated-exercises-swept";

const sweepLegacyKeys = () => {
  if (storage.getBoolean(LEGACY_SWEPT_KEY)) {
    return;
  }
  for (const key of storage.getAllKeys()) {
    if (LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      storage.remove(key);
    }
  }
  storage.set(LEGACY_SWEPT_KEY, true);
};

export interface CachedEntry<T> {
  savedAt: number;
  value: T;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSummary = (value: unknown): value is ExerciseSummary =>
  isRecord(value) &&
  typeof value.slug === "string" &&
  typeof value.name === "string" &&
  typeof value.thumbnail_url === "string" &&
  typeof value.video_url === "string" &&
  Array.isArray(value.muscle_groups) &&
  value.muscle_groups.every((group) => typeof group === "string");

const isExercise = (value: unknown): value is Exercise =>
  isSummary(value) &&
  isRecord(value) &&
  typeof value.description === "string" &&
  typeof value.instructions === "string";

/** The entry under `key`; an unreadable or malformed value counts as none. */
const read = <T>(
  key: string,
  isValue: (value: unknown) => value is T
): CachedEntry<T> | undefined => {
  sweepLegacyKeys();
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
  if (
    isRecord(entry) &&
    typeof entry.savedAt === "number" &&
    isValue(entry.value)
  ) {
    return { savedAt: entry.savedAt, value: entry.value };
  }
};

const write = <T>(key: string, value: T, savedAt: number) => {
  sweepLegacyKeys();
  storage.set(key, JSON.stringify({ savedAt, value }));
};

export const readCachedSummary = (language: AppLanguage, slug: string) =>
  read(summaryKey(language, slug), isSummary);

export const readCachedExercise = (language: AppLanguage, slug: string) =>
  read(exerciseKey(language, slug), isExercise);

export const writeCachedSummary = (
  language: AppLanguage,
  { muscle_groups, name, slug, thumbnail_url, video_url }: ExerciseSummary,
  savedAt = Date.now()
) =>
  write(
    summaryKey(language, slug),
    { muscle_groups, name, slug, thumbnail_url, video_url },
    savedAt
  );

/** Keeps the Exercise in full, and its summary for the rows that show it. */
export const writeCachedExercise = (
  language: AppLanguage,
  exercise: Exercise,
  savedAt = Date.now()
) => {
  write(exerciseKey(language, exercise.slug), exercise, savedAt);
  writeCachedSummary(language, exercise, savedAt);
};

/** Forgets an Exercise the Library no longer has, in every App language. */
export const removeCachedExercise = (slug: string) => {
  for (const language of appLanguages) {
    storage.remove(summaryKey(language, slug));
    storage.remove(exerciseKey(language, slug));
  }
};
