export {
  createLibrary,
  type LibraryOptions,
  MAX_LOOKUP_SLUGS,
} from "./client";
export {
  LibraryError,
  type LibraryErrorCode,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "./errors";
export { exerciseNameFromSlug } from "./name";
export type {
  Cover,
  Exercise,
  ExerciseBatch,
  ExercisePage,
  ExerciseSummary,
  LanguageOption,
  Library,
  ListExercisesParams,
} from "./types";
