import type { MuscleGroup } from "@fitme/core/models";
import {
  ExerciseLibraryError,
  type ExerciseSummary,
} from "@fitme/exercise-library";
import { reportError } from "@fitme/observability/node";
import { z } from "zod";
import { exerciseLibrary } from "./exercise-library";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_SEPARATORS = /[-_]+/g;

/** An Exercise slug as the tools take it; checked against the library before any write. */
export const exerciseSlugSchema = z.string().trim().min(1).max(200);

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

const unavailable = {
  error:
    "The exercise library is unavailable right now, so nothing was saved. Try again in a moment.",
};

/**
 * Checks Exercise slugs before a tool writes them (one lookup, outside any
 * transaction): `{ exercises }` by slug when the library has every one, or an
 * `{ error }` for the model, so nothing gets written. A uuid (an exercise id
 * from an older Conversation) gets an error that sends the model searching by
 * name; a library failure is reported and asks to retry.
 */
export const checkExerciseSlugs = async (
  slugs: readonly string[]
): Promise<{ error: string } | { exercises: Map<string, ExerciseSummary> }> => {
  const uuids = slugs.filter((slug) => UUID.test(slug));
  if (uuids.length > 0) {
    return {
      error: `Exercises are referred to by exercise_slug now, not by id (${uuids.join(", ")}). Use search_exercises with the exercise's name to find its exercise_slug; nothing was saved.`,
    };
  }
  try {
    const { data, missing } = await exerciseLibrary().lookup(slugs);
    if (missing.length > 0) {
      return {
        error: `Unknown exercise_slug(s): ${missing.join(", ")}. Use search_exercises to find a valid exercise_slug; nothing was saved.`,
      };
    }
    return {
      exercises: new Map(data.map((exercise) => [exercise.slug, exercise])),
    };
  } catch (error) {
    if (!(error instanceof ExerciseLibraryError)) {
      throw error;
    }
    await reportError(error, { exercise_library: "check" });
    return unavailable;
  }
};

/**
 * Name and muscle groups for each slug, through one lookup (after the read's
 * transaction). A slug the library doesn't know, or every slug when the
 * library fails (reported), gets a name made from the slug and no muscle
 * groups, so a read always answers.
 */
export const describeExercises = async (
  slugs: readonly string[]
): Promise<(slug: string) => ExerciseDetails> => {
  const known = new Map<string, ExerciseDetails>();
  if (slugs.length > 0) {
    try {
      const { data } = await exerciseLibrary().lookup(slugs);
      for (const { muscle_groups, name, slug } of data) {
        known.set(slug, { muscle_groups, name });
      }
    } catch (error) {
      if (!(error instanceof ExerciseLibraryError)) {
        throw error;
      }
      await reportError(error, { exercise_library: "describe" });
    }
  }
  return (slug) =>
    known.get(slug) ?? { muscle_groups: [], name: nameFromSlug(slug) };
};
