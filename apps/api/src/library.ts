import { pickCovers } from "@fitme/core/covers";
import type { MuscleGroup } from "@fitme/core/models";
import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type {
  IndexCover,
  IndexExercise,
  LibraryIndex,
} from "@fitme/library-bundle/library-index";
import { libraryBundleSource } from "@fitme/library-bundle/source";

export type { LibraryIndex } from "@fitme/library-bundle/library-index";

/** The Library index couldn't be loaded (its load reported why). */
export class LibraryIndexUnavailableError extends Error {
  constructor() {
    super("The Library index couldn't be loaded; try again");
    this.name = "LibraryIndexUnavailableError";
  }
}

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

/** What the Library index says about a write's Exercise slugs. */
export type SlugCheck =
  | { exercises: IndexExercise[]; status: "known" }
  | { slugs: string[]; status: "unknown" }
  | { status: "unavailable" };

/** A check the write can't go ahead on. */
type RefusedCheck = Exclude<SlugCheck, { status: "known" }>;

/** One index lookup of `slugs`, refused unless every one is known. */
const lookUpSlugs = async ({
  index,
  slugs,
}: {
  index: LibraryIndex;
  slugs: string[];
}): Promise<
  | RefusedCheck
  | {
      covers: IndexCover[];
      exercises: IndexExercise[];
      status: "known";
    }
> => {
  const found = await index.lookup(slugs);

  if (found.status === "unavailable") {
    return found;
  }

  return found.missing.length > 0
    ? { slugs: found.missing, status: "unknown" }
    : { covers: found.covers, exercises: found.exercises, status: "known" };
};

/**
 * Checks every slug a write carries against the Library index, before the
 * services open their transaction (ADR 0010, ADR 0018). With no index (its
 * load failed, which it reported) the answer is `unavailable`, so the write
 * never goes ahead with unchecked Exercises. Known slugs answer the
 * Exercises the index has, with their muscle groups.
 */
export const checkExerciseSlugs = async (options: {
  index: LibraryIndex;
  slugs: string[];
}): Promise<SlugCheck> => {
  const check = await lookUpSlugs(options);

  return check.status === "known"
    ? { exercises: check.exercises, status: "known" }
    : check;
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
 * Checks every slug a Plan write's Workouts carry against the index, and
 * answers a picker over the index's Covers and the muscle groups it has for
 * those slugs, both from the same lookup. An index without Covers picks
 * `null` for each.
 */
export const checkSlugsForCovers = async ({
  index,
  random,
  workouts,
}: {
  index: LibraryIndex;
  random?: () => number;
  workouts: readonly WorkoutToCover[];
}): Promise<CoverPickerCheck> => {
  const found = await lookUpSlugs({
    index,
    slugs: [
      ...new Set(
        workouts.flatMap((workout) =>
          workout.exercises.map((exercise) => exercise.exercise_slug)
        )
      ),
    ],
  });

  if (found.status !== "known") {
    return found;
  }

  // The index keeps muscle groups as the bundle writes them, so a group this
  // build doesn't know yet is compared like any other.
  const muscleGroups = new Map(
    found.exercises.map((exercise) => [
      exercise.slug,
      // SAFETY: pickCovers only compares groups for equality, so one this build's MuscleGroup doesn't list is matched like any other.
      exercise.muscle_groups as MuscleGroup[],
    ])
  );

  const covers = found.covers.map((cover) => ({
    id: cover.id,
    // SAFETY: as above, pickCovers only compares the groups for equality.
    muscleGroups: cover.muscle_groups as MuscleGroup[],
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

/** The error a write answers when the index refused it or couldn't be loaded. */
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
