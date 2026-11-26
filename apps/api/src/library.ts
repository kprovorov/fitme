import { pickCovers } from "@fitme/core/covers";
import type { LegacyMuscleGroup } from "@fitme/core/models";
import type { KnownSlug } from "@fitme/library-bundle/in-memory-library";
import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { libraryBundleSource } from "@fitme/library-bundle/source";

import type { LibraryV2 } from "./exercise-library.js";

export type { LibraryIndex } from "@fitme/library-bundle/library-index";

/**
 * The bundle the environment names: production's Blob store, LIBRARY_BUNDLE
 * or the committed fixture anywhere else.
 */
export const libraryBundleSourceFromEnv = () =>
  libraryBundleSource({
    env: {
      BLOB_STORE_ID: process.env.BLOB_STORE_ID,
      LIBRARY_BUNDLE: process.env.LIBRARY_BUNDLE,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });

/**
 * The instance's Library index (ADR 0018) over `libraryBundleSourceFromEnv`'s
 * bundle. Loaded on the first write that asks; every failed load is reported
 * through `reportError`.
 */
export const libraryIndexFromEnv = (
  reportError: (error: Error) => Promise<void>
): LibraryIndex =>
  createLibraryIndex({ load: libraryBundleSourceFromEnv().load, reportError });

/** What the new Library says about a write's Exercise slugs. */
export type SlugCheck =
  | { exercises: KnownSlug[]; status: "known" }
  | { slugs: string[]; status: "unknown" }
  | { status: "unavailable" };

/** A check the write can't go ahead on. */
type RefusedCheck = Exclude<SlugCheck, { status: "known" }>;

/**
 * Checks every slug a write carries against the new Library (ADR 0022),
 * before the services open their transaction: a slug it has, or an old one
 * its `replaced_slugs` map still resolves, is known, and the slug as sent is
 * what gets stored. With no Library (its load failed, which it reported) the
 * answer is `unavailable`, so the write never goes ahead with unchecked
 * Exercises. Known slugs answer what they stand for, with the Exercise's
 * primary muscle groups.
 */
export const checkExerciseSlugs = async ({
  library,
  slugs,
}: {
  library: LibraryV2;
  slugs: readonly string[];
}): Promise<SlugCheck> => {
  const answer = await library.get();

  if (answer.status === "unavailable") {
    return answer;
  }

  const { known, unknown } = answer.library.checkSlugs(slugs);

  return unknown.length > 0
    ? { slugs: unknown, status: "unknown" }
    : { exercises: known, status: "known" };
};

/** What a Plan write's Workouts need from the Library: their slugs checked, then a Cover each. */
export type CoveredCheck =
  | RefusedCheck
  | { covers: (string | null)[]; status: "known" };

/** A Workout as a Plan write sends it, as far as its Cover goes. */
interface WorkoutToCover {
  exercises: readonly { exercise_slug: string }[];
}

/**
 * Picks a Cover for each of `workouts` (ADR 0014), in order, counting
 * `usedCoverIds` (the Covers the Plan's other Workouts hold) as used.
 */
export type CoverPicker = (
  workouts: readonly WorkoutToCover[],
  usedCoverIds: readonly string[]
) => (string | null)[];

/** What a Plan write needs from the Library: its slugs checked, then the Covers to pick from. */
export type CoverPickerCheck =
  | RefusedCheck
  | { pickCovers: CoverPicker; status: "known" };

/**
 * Checks every slug a Plan write's Workouts carry against the new Library
 * (`checkExerciseSlugs`), then answers a picker over the Legacy Library
 * index's Covers (ADR 0014, ADR 0018) and the muscle groups the new Library
 * has for those slugs. `pickCovers` matches by muscle group id, so the ids
 * the two lists share match and the rest fall back to any Cover. An index
 * without Covers picks `null` for each; one that can't load (reported)
 * refuses the write as `unavailable`, as before.
 */
export const checkSlugsForCovers = async ({
  index,
  library,
  random,
  workouts,
}: {
  index: LibraryIndex;
  library: LibraryV2;
  random?: () => number;
  workouts: readonly WorkoutToCover[];
}): Promise<CoverPickerCheck> => {
  const check = await checkExerciseSlugs({
    library,
    slugs: [
      ...new Set(
        workouts.flatMap((workout) =>
          workout.exercises.map((exercise) => exercise.exercise_slug)
        )
      ),
    ],
  });

  if (check.status !== "known") {
    return check;
  }

  // No slug to look up: the lookup only answers the index's Covers.
  const found = await index.lookup([]);

  if (found.status === "unavailable") {
    return found;
  }

  // Keyed by the slug as sent, which is what each Workout carries.
  const muscleGroups = new Map(
    check.exercises.map((exercise) => [
      exercise.requested_slug,
      // SAFETY: pickCovers only compares groups for equality, so a new Library group the legacy list lacks simply matches no Cover.
      exercise.muscle_groups as readonly LegacyMuscleGroup[],
    ])
  );

  const covers = found.covers.map((cover) => ({
    id: cover.id,
    // SAFETY: as above, pickCovers only compares the groups for equality.
    muscleGroups: cover.muscle_groups as LegacyMuscleGroup[],
  }));

  return {
    pickCovers: (toCover, usedCoverIds) =>
      pickCovers({
        covers,
        random,
        usedCoverIds,
        workouts: toCover.map((workout) => ({
          exercises: workout.exercises.map((exercise) => ({
            muscleGroups: muscleGroups.get(exercise.exercise_slug) ?? [],
          })),
        })),
      }),
    status: "known",
  };
};

/**
 * `checkSlugsForCovers`, then a Cover for each of a write's Workouts: no
 * Cover counts as used, since the write creates or replaces every Workout of
 * its Plan.
 */
export const checkSlugsAndPickCovers = async (
  options: Parameters<typeof checkSlugsForCovers>[0]
): Promise<CoveredCheck> => {
  const check = await checkSlugsForCovers(options);

  return check.status === "known"
    ? { covers: check.pickCovers(options.workouts, []), status: "known" }
    : check;
};

/** The error a write answers when the Library refused it or couldn't be loaded. */
export const refusalOf = (check: RefusedCheck) => {
  switch (check.status) {
    case "unavailable": {
      return {
        body: {
          error: {
            code: "library_unavailable",
            message:
              "The Library is unavailable, so the Exercises couldn't be checked; try again",
          },
        },
        status: 503 as const,
      };
    }

    case "unknown": {
      return {
        body: {
          error: {
            code: "unknown_exercises",
            message: `Unknown exercise_slug(s): ${check.slugs.join(", ")}`,
          },
        },
        status: 400 as const,
      };
    }
  }
};

/** The error a write answers when its Exercise slugs aren't all known, or `null` when they are. */
export const slugRefusal = (check: SlugCheck) =>
  check.status === "known" ? null : refusalOf(check);
