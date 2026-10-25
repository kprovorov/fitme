import type { Exercise, ExerciseSummary } from "@fitme/library-sdk";
import { storage } from "~/lib/mmkv";

// The Exercises the app has resolved, kept in MMKV so they show offline and
// right after a restart. Exercise Library content is the same for every User,
// so it isn't kept per User. Each entry carries when it was saved, so a query
// starting from it knows whether it's stale.

const SUMMARY_PREFIX = "exercises.summary.";
const EXERCISE_PREFIX = "exercises.exercise.";

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
  storage.set(key, JSON.stringify({ savedAt, value }));
};

export const readCachedSummary = (slug: string) =>
  read(`${SUMMARY_PREFIX}${slug}`, isSummary);

export const readCachedExercise = (slug: string) =>
  read(`${EXERCISE_PREFIX}${slug}`, isExercise);

export const writeCachedSummary = (
  { muscle_groups, name, slug, thumbnail_url, video_url }: ExerciseSummary,
  savedAt = Date.now()
) =>
  write(
    `${SUMMARY_PREFIX}${slug}`,
    { muscle_groups, name, slug, thumbnail_url, video_url },
    savedAt
  );

/** Keeps the Exercise in full, and its summary for the rows that show it. */
export const writeCachedExercise = (
  exercise: Exercise,
  savedAt = Date.now()
) => {
  write(`${EXERCISE_PREFIX}${exercise.slug}`, exercise, savedAt);
  writeCachedSummary(exercise, savedAt);
};

/** Forgets an Exercise the Exercise Library no longer has. */
export const removeCachedExercise = (slug: string) => {
  storage.remove(`${SUMMARY_PREFIX}${slug}`);
  storage.remove(`${EXERCISE_PREFIX}${slug}`);
};
