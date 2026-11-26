export { createLibrary, type LibraryOptions } from "./client";

export {
  LibraryError,
  type LibraryErrorCode,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "./errors";

export { exerciseNameFromSlug } from "./name";

export type { Cover, Library } from "./types";
