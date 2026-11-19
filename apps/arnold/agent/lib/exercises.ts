import { MAX_EXERCISE_SLUG_LENGTH } from "@fitme/core/limits";
import type { AppLanguage, MuscleGroup } from "@fitme/core/models";
import { z } from "zod";

import { getLibrary } from "./library";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SLUG_SEPARATORS = /[-_]+/gu;

/** An Exercise slug as the tools take it, with the Plan writes' bound; checked against the library before any write. */
export const exerciseSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_EXERCISE_SLUG_LENGTH);

/** An Exercise the way the read tools show it. */
export interface ExerciseDetails {
  /** The primary ones. */
  muscle_groups: MuscleGroup[];
  name: string;
}

/** A readable name made from a slug, for one the library doesn't know: `bench-press` → `Bench press`. */
export const nameFromSlug = (slug: string): string => {
  const words = slug.replaceAll(SLUG_SEPARATORS, " ").trim();

  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** What a tool answers when the Library can't load: nothing was done. */
export const libraryUnavailable = (done: string) => ({
  error: `The exercise library is unavailable right now, so ${done}. Try again in a moment.`,
});

/**
 * Checks Exercise slugs before a tool writes them, against the instance's
 * Library (ADR 0022; in process, outside any transaction): `null` when it
 * knows every one, an old slug in its `replaced_slugs` included (stored as
 * sent until the rewrite), else an `{ error }` for the model, so nothing gets
 * written. A uuid (an exercise id from an older Conversation) gets an error
 * that sends the model searching by name; a Library that can't load (its load
 * reported why) asks to retry.
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

  const answer = await getLibrary().get();

  if (answer.status === "unavailable") {
    return libraryUnavailable("nothing was saved");
  }

  const { unknown } = answer.library.checkSlugs(slugs);

  return unknown.length > 0
    ? {
        error: `Unknown exercise_slug(s): ${unknown.join(", ")}. Use search_exercises to find a valid exercise_slug; nothing was saved.`,
      }
    : null;
};

/** A Workout Exercise or Workout Session Exercise as the services return it. */
interface StoredExercise<Set> {
  exercise_slug: string;
  id: string;
  order: number;
  sets: Set[];
}

/**
 * Each group's Exercises with their name and primary muscle groups, through
 * one lookup in the instance's Library (after the read's transaction, no
 * network call). An old slug is named as the Exercise replacing it, keeping
 * its stored `exercise_slug`. A slug the Library doesn't know, or every slug
 * when it can't load (its load reported why), gets a name made from the slug
 * and no muscle groups, so a read always answers. Names are in `language`; an
 * Exercise without a translation in it is named in English.
 */
export const withExerciseDetails = async <Set>(
  groups: readonly (readonly StoredExercise<Set>[])[],
  language: AppLanguage
): Promise<(StoredExercise<Set> & ExerciseDetails)[][]> => {
  const slugs = groups.flatMap((group) =>
    group.map(({ exercise_slug }) => exercise_slug)
  );

  const known = new Map<string, ExerciseDetails>();

  if (slugs.length > 0) {
    const answer = await getLibrary().get();

    if (answer.status === "ready") {
      const { data } = answer.library.lookup(slugs, { language });

      for (const { muscle_groups, name, requested_slug } of data) {
        known.set(requested_slug, { muscle_groups, name });
      }
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
