import type { LibraryError } from "./errors";
import type { Cover, Library } from "./types";

export interface FakeLibrary extends Library {
  /** Every call fails with `error` from now on; `null` makes calls answer again. */
  failWith: (error: LibraryError | null) => void;
}

/**
 * An in-memory Library for consumers' tests: `covers()` answers these Covers
 * (none by default) in this order, as the real client would, and it can be
 * told to fail.
 */
export const createFakeLibrary = (
  covers: readonly Cover[] = []
): FakeLibrary => {
  let failure: LibraryError | null = null;

  return {
    // copies, as the client answers fresh objects on every call
    covers: async () => {
      if (failure) {
        throw failure;
      }

      return await Promise.resolve(
        covers.map(({ id, image_url, muscle_groups }) => ({
          id,
          image_url,
          muscle_groups: [...muscle_groups],
        }))
      );
    },

    failWith: (error) => {
      failure = error;
    },
  };
};
