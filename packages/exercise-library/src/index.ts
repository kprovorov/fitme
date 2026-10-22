export {
  createExerciseLibrary,
  type ExerciseLibraryOptions,
  MAX_LOOKUP_SLUGS,
} from "./client";
export {
  ExerciseLibraryError,
  type ExerciseLibraryErrorCode,
  ExerciseLibraryInvalidRequestError,
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnauthorizedError,
  ExerciseLibraryUnavailableError,
} from "./errors";
export type {
  Exercise,
  ExerciseBatch,
  ExerciseLibrary,
  ExercisePage,
  ExerciseSummary,
  ListExercisesParams,
} from "./types";
