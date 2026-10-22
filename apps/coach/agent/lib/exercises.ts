import type { MuscleGroup } from "@fitme/core/models";
import { ExerciseLibraryError } from "@fitme/exercise-library";
import { reportError } from "@fitme/observability/node";
import { z } from "zod";
import { exerciseLibrary } from "./exercise-library";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_SEPARATORS = /[-_]+/g;

/** Longer than any Exercise slug; only keeps a runaway input off the API. */
const MAX_SLUG_LENGTH = 200;

/** An Exercise slug as the tools take it; checked against the library before any write. */
export const exerciseSlugSchema = z.string().trim().min(1).max(MAX_SLUG_LENGTH);

/** An Exercise the way the read tools show it. */
export interface ExerciseDetails {
  muscle_groups: MuscleGroup[];
  name: string;
}

/** A readable name made from a slug, for one the library doesn't know: `bench-press` → `Bench press`. */
export const nameFromSlug = (slug: string): string => {
  const words = slug.replace(SLUG_SEPARATORS, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** What a tool answers when the Exercise Library fails: nothing was done. */
export const libraryUnavailable = (done: string) => ({
  error: `The exercise library is unavailable right now, so ${done}. Try again in a moment.`,
});

/**
 * Reports an Exercise Library failure (`step` tags which use failed) and
 * returns `fallback`; any other error is rethrown.
 */
export const onLibraryFailure = async <T>(
  error: unknown,
  step: string,
  fallback: T
): Promise<T> => {
  if (!(error instanceof ExerciseLibraryError)) {
    throw error;
  }
  await reportError(error, { exercise_library: step });
  return fallback;
};

/**
 * Checks Exercise slugs before a tool writes them (one lookup, outside any
 * transaction): `null` when the library has every one, else an `{ error }`
 * for the model, so nothing gets written. A uuid (an exercise id from an
 * older Conversation) gets an error that sends the model searching by name;
 * a library failure is reported and asks to retry.
 */
export const checkExerciseSlugs = async (
  slugs: readonly string[]
): Promise<{ error: string } | null> => {
  const uuids = slugs.filter((slug) => UUID.test(slug));
  if (uuids.length > 0) {
    return {
      error: `Exercises are referred to by exercise_slug now, not by id (${uuids.join(", ")}). Use search_exercises with the exercise's name to find its exercise_slug; nothing was saved.`,
    };
  }
  try {
    const { missing } = await exerciseLibrary().lookup(slugs);
    return missing.length > 0
      ? {
          error: `Unknown exercise_slug(s): ${missing.join(", ")}. Use search_exercises to find a valid exercise_slug; nothing was saved.`,
        }
      : null;
  } catch (error) {
    return await onLibraryFailure(
      error,
      "check",
      libraryUnavailable("nothing was saved")
    );
  }
};

/** A Workout Exercise or Workout Session Exercise as the services return it. */
interface StoredExercise<Set> {
  exercise_slug: string;
  id: string;
  order: number;
  sets: Set[];
}

/**
 * Each group's Exercises with their name and muscle groups, through one
 * lookup (after the read's transaction); the services' legacy joined
 * `exercise` is left out. A slug the library doesn't know, or every slug when
 * the library fails (reported), gets a name made from the slug and no muscle
 * groups, so a read always answers.
 */
export const withExerciseDetails = async <Set>(
  groups: readonly (readonly StoredExercise<Set>[])[]
): Promise<(StoredExercise<Set> & ExerciseDetails)[][]> => {
  const slugs = groups.flatMap((group) =>
    group.map(({ exercise_slug }) => exercise_slug)
  );
  const known = new Map<string, ExerciseDetails>();
  if (slugs.length > 0) {
    try {
      const { data } = await exerciseLibrary().lookup(slugs);
      for (const { muscle_groups, name, slug } of data) {
        known.set(slug, { muscle_groups, name });
      }
    } catch (error) {
      await onLibraryFailure(error, "describe", undefined);
    }
  }
  return groups.map((group) =>
    group.map(({ exercise_slug, id, order, sets }) => ({
      exercise_slug,
      id,
      ...(known.get(exercise_slug) ?? {
        muscle_groups: [],
        name: nameFromSlug(exercise_slug),
      }),
      order,
      sets,
    }))
  );
};
