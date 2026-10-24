import {
  createExerciseLibrary,
  type ExerciseLibrary,
} from "@fitme/exercise-library";

/**
 * Builds the Exercise Library client writes check their Exercise slugs with,
 * or returns `null` when the API isn't configured for it.
 */
export type ExerciseLibraryFactory = () => ExerciseLibrary | null;

/**
 * The Exercise Library API at `EXERCISES_URL`, called with the Public API's
 * own server secret (`EXERCISES_API_SECRET`), never a User's token.
 */
export const createExerciseLibraryFromEnv: ExerciseLibraryFactory = () => {
  const url = process.env.EXERCISES_URL;
  const secret = process.env.EXERCISES_API_SECRET;
  if (!(url && secret)) {
    return null;
  }
  return createExerciseLibrary({ token: () => Promise.resolve(secret), url });
};

/** What one batch lookup says about a write's Exercise slugs. */
export type SlugCheck =
  | { status: "known" }
  | { slugs: string[]; status: "unknown" }
  | { status: "unavailable" };

/**
 * Checks every slug a write carries with one batch lookup, before the
 * services open their transaction (ADR 0010). The library failing, or not
 * being configured, is reported and answers `unavailable`, so the write
 * never goes ahead with unchecked Exercises.
 */
export const checkExerciseSlugs = async ({
  library,
  reportError,
  slugs,
}: {
  library: ExerciseLibrary | null;
  reportError: (error: unknown) => Promise<void>;
  slugs: string[];
}): Promise<SlugCheck> => {
  if (!library) {
    await reportError(
      new Error(
        "Missing EXERCISES_URL or EXERCISES_API_SECRET environment variable"
      )
    );
    return { status: "unavailable" };
  }
  try {
    const { missing } = await library.lookup(slugs);
    return missing.length > 0
      ? { slugs: missing, status: "unknown" }
      : { status: "known" };
  } catch (error) {
    await reportError(error);
    return { status: "unavailable" };
  }
};
