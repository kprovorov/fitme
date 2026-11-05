import { createLibrary, LibraryUnavailableError } from "@fitme/library-sdk";
import type { Library } from "@fitme/library-sdk";

/** Answers every call unavailable: `LIBRARY_URL` isn't set. */
const unconfigured: Library = {
  covers: async () => Promise.reject(notConfigured()),
  get: async () => Promise.reject(notConfigured()),
  list: async () => Promise.reject(notConfigured()),
  lookup: async () => Promise.reject(notConfigured()),
};

const notConfigured = () =>
  new LibraryUnavailableError({
    cause: new Error("LIBRARY_URL is not set"),
  });

let library: Library | undefined;

/**
 * The Library API client the tools read through, as Arnold: `LIBRARY_URL`
 * with `LIBRARY_ARNOLD_SECRET` as the bearer. Created on first use; without a
 * URL every call fails unavailable.
 */
export const getLibrary = (): Library => {
  if (!library) {
    const url = process.env.LIBRARY_URL;
    library = url
      ? createLibrary({
          token: async () => Promise.resolve(process.env.LIBRARY_ARNOLD_SECRET),
          url,
        })
      : unconfigured;
  }

  return library;
};
