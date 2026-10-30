import { pickCovers } from "@fitme/core/covers";
import type { MuscleGroup } from "@fitme/core/models";
import {
  type Cover,
  createLibrary,
  type ExerciseSummary,
  type Library,
} from "@fitme/library-sdk";

/**
 * Builds the Library client writes check their Exercise slugs with,
 * or returns `null` when the API isn't configured for it.
 */
export type LibraryFactory = () => Library | null;

/**
 * The Library API at `LIBRARY_URL`, called with the Public API's
 * own server secret (`LIBRARY_PUBLIC_API_SECRET`), never a User's token.
 */
export const createLibraryFromEnv: LibraryFactory = () => {
  const url = process.env.LIBRARY_URL;
  const secret = process.env.LIBRARY_PUBLIC_API_SECRET;
  if (!(url && secret)) {
    return null;
  }
  return createLibrary({ token: () => Promise.resolve(secret), url });
};

/** What one batch lookup says about a write's Exercise slugs. */
export type SlugCheck =
  | { exercises: ExerciseSummary[]; status: "known" }
  | { slugs: string[]; status: "unknown" }
  | { status: "unavailable" };

/**
 * Checks every slug a write carries with one batch lookup, before the
 * services open their transaction (ADR 0010). The library failing, or not
 * being configured, is reported and answers `unavailable`, so the write
 * never goes ahead with unchecked Exercises. Known slugs answer the
 * Exercises the lookup found.
 */
export const checkExerciseSlugs = async ({
  library,
  reportError,
  slugs,
}: {
  library: Library | null;
  reportError: (error: unknown) => Promise<void>;
  slugs: string[];
}): Promise<SlugCheck> => {
  if (!library) {
    await reportError(
      new Error(
        "Missing LIBRARY_URL or LIBRARY_PUBLIC_API_SECRET environment variable"
      )
    );
    return { status: "unavailable" };
  }
  try {
    const { data, missing } = await library.lookup(slugs);
    return missing.length > 0
      ? { slugs: missing, status: "unknown" }
      : { exercises: data, status: "known" };
  } catch (error) {
    await reportError(error);
    return { status: "unavailable" };
  }
};

/** A check the write can't go ahead on. */
type RefusedCheck =
  | Exclude<SlugCheck, { status: "known" }>
  | { status: "covers_unavailable" };

/** What a Plan write's Workouts need from the Library: their slugs checked, then a Cover each. */
export type CoveredCheck =
  | RefusedCheck
  | { covers: Array<string | null>; status: "known" };

/** A Workout as a Plan write sends it, as far as its Cover goes. */
interface WorkoutToCover {
  exercises: ReadonlyArray<{ exercise_slug: string }>;
}

/**
 * Checks every slug of a Plan write's new Workouts (`checkExerciseSlugs`),
 * then picks each Workout a Cover (ADR 0014) from one `covers()` call and the
 * muscle groups the lookup answered: no Cover counts as used, since a write
 * replaces every Workout of its Plan. `covers()` failing is reported and
 * answers `covers_unavailable`, so a Workout is never created without its
 * Cover. A Library without Covers answers `null` for each.
 */
export const checkSlugsAndPickCovers = async ({
  library,
  random,
  reportError,
  workouts,
}: {
  library: Library | null;
  random?: () => number;
  reportError: (error: unknown) => Promise<void>;
  workouts: readonly WorkoutToCover[];
}): Promise<CoveredCheck> => {
  const check = await checkExerciseSlugs({
    library,
    reportError,
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
  let covers: Cover[];
  try {
    // A known check had a library to look the slugs up in.
    covers = await (library as Library).covers();
  } catch (error) {
    await reportError(error);
    return { status: "covers_unavailable" };
  }
  const muscleGroups = new Map<string, readonly MuscleGroup[]>(
    check.exercises.map((exercise) => [exercise.slug, exercise.muscle_groups])
  );
  return {
    covers: pickCovers({
      covers: covers.map((cover) => ({
        id: cover.id,
        muscleGroups: cover.muscle_groups,
      })),
      random,
      workouts: workouts.map((workout) => ({
        exercises: workout.exercises.map((exercise) => ({
          muscleGroups: muscleGroups.get(exercise.exercise_slug) ?? [],
        })),
      })),
    }),
    status: "known",
  };
};

/** The 503 a write answers when the Library can't be read. */
const libraryUnavailable = (message: string) => ({
  body: { error: { code: "library_unavailable", message } },
  status: 503 as const,
});

/** The error a write answers when the Library refused it or couldn't be read. */
export const refusalOf = (check: RefusedCheck) => {
  switch (check.status) {
    case "unavailable":
      return libraryUnavailable(
        "The Library is unavailable, so the Exercises couldn't be checked; try again"
      );
    case "covers_unavailable":
      return libraryUnavailable(
        "The Library is unavailable, so the Workouts' Covers couldn't be picked; try again"
      );
    default:
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
};

/** The error a write answers when its Exercise slugs aren't all known, or `null` when they are. */
export const slugRefusal = (check: SlugCheck) =>
  check.status === "known" ? null : refusalOf(check);
