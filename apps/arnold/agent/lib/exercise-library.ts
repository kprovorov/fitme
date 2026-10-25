import {
  createExerciseLibrary,
  type ExerciseLibrary,
  ExerciseLibraryUnavailableError,
} from "@fitme/exercise-library";

/** Answers every call unavailable: `EXERCISES_URL` isn't set. */
const unconfigured: ExerciseLibrary = {
  get: () => Promise.reject(notConfigured()),
  list: () => Promise.reject(notConfigured()),
  lookup: () => Promise.reject(notConfigured()),
};

const notConfigured = () =>
  new ExerciseLibraryUnavailableError({
    cause: new Error("EXERCISES_URL is not set"),
  });

let library: ExerciseLibrary | undefined;

/**
 * The Exercise Library API client the tools read through, as Arnold:
 * `EXERCISES_URL` with `EXERCISES_ARNOLD_SECRET` (or the pre-rename
 * `EXERCISES_COACH_SECRET` when that's unset or empty) as the bearer. Created
 * on first use; without a URL every call fails unavailable.
 */
export const exerciseLibrary = (): ExerciseLibrary => {
  if (!library) {
    const url = process.env.EXERCISES_URL;
    library = url
      ? createExerciseLibrary({
          token: () =>
            Promise.resolve(
              process.env.EXERCISES_ARNOLD_SECRET ||
                process.env.EXERCISES_COACH_SECRET
            ),
          url,
        })
      : unconfigured;
  }
  return library;
};
