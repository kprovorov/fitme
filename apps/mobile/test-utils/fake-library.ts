import type { Cover, Library } from "@fitme/library-sdk";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import type { FakeLibrary } from "@fitme/library-sdk/fake";

interface LibraryHolder {
  current: Library;
}

/**
 * What `~/lib/library` exports in tests: point `current` at a fake
 * (or a real client on a stubbed `fetch`) per test.
 *
 *   jest.mock("~/lib/library", () =>
 *     jest.requireActual<typeof import("~/test-utils/fake-library")>(
 *       "~/test-utils/fake-library"
 *     ).libraryModule
 *   );
 */
export const library: LibraryHolder = {
  current: createFakeLibrary(),
};

export const libraryModule = {
  getLibrary: (): Library => library.current,
};

/**
 * Makes a fake over these Covers (none by default) the one the app reads.
 * Only the Covers come from it: Exercises are the fake Public API's
 * (`serveExercises`).
 */
export const serveLibrary = (covers: readonly Cover[] = []): FakeLibrary => {
  const fake = createFakeLibrary(covers);
  library.current = fake;

  return fake;
};
