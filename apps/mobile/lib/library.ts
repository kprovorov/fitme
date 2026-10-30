import {
  createLibrary,
  type Library,
  LibraryUnavailableError,
} from "@fitme/library-sdk";
import { getClerk } from "~/lib/clerk";

const notConfigured = () =>
  new LibraryUnavailableError({
    cause: new Error("EXPO_PUBLIC_LIBRARY_URL is not set"),
  });

/** Answers every call unavailable, with no request: no URL to send it to. */
const unconfigured: Library = {
  covers: () => Promise.reject(notConfigured()),
  get: () => Promise.reject(notConfigured()),
  list: () => Promise.reject(notConfigured()),
  lookup: () => Promise.reject(notConfigured()),
};

let library: Library | undefined;

/**
 * The Library API, called as the signed-in User with their Clerk session
 * token, resolved per request so Clerk's refreshes apply. Created on first
 * use. Unset `EXPO_PUBLIC_LIBRARY_URL` fails every call unavailable, so
 * Exercises show the names made from their slugs.
 */
export const getLibrary = (): Library => {
  if (!library) {
    const url = process.env.EXPO_PUBLIC_LIBRARY_URL;
    library = url
      ? createLibrary({
          token: async () => (await getClerk().session?.getToken()) ?? null,
          url,
        })
      : unconfigured;
  }
  return library;
};
