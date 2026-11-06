import { createLibrary, LibraryUnavailableError } from "@fitme/library-sdk";
import type { Library } from "@fitme/library-sdk";

const notConfigured = () =>
  new LibraryUnavailableError({
    cause: new Error("LIBRARY_URL is not set"),
  });

/** Answers every call unavailable: `LIBRARY_URL` isn't set. */
const unconfigured: Library = {
  covers: async () => await Promise.reject(notConfigured()),
  get: async () => await Promise.reject(notConfigured()),
  list: async () => await Promise.reject(notConfigured()),
  lookup: async () => await Promise.reject(notConfigured()),
};

let library: Library | undefined;

/**
 * The Library API client the tools read through, as Arnold: `LIBRARY_URL`
 * with `LIBRARY_ARNOLD_SECRET` as the bearer. Created on first use; without a
 * URL every call fails unavailable.
 */
export const getLibrary = (): Library => {
  if (!library) {
    const url = process.env.LIBRARY_URL;
    library =
      url !== undefined && url !== ""
        ? createLibrary({
            token: async () =>
              await Promise.resolve(process.env.LIBRARY_ARNOLD_SECRET),
            url,
          })
        : unconfigured;
  }

  return library;
};
