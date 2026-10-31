import type { MuscleGroup } from "@fitme/core";
import type { Cover, Exercise, Library } from "@fitme/library-sdk";
import {
  createFakeLibrary,
  type FakeExercise,
  type FakeLibrary,
} from "@fitme/library-sdk/fake";

/**
 * A made-up Exercise of the Library, named in title case, in English unless
 * `overrides` gives it `translations` (`{ uk: { name, description?,
 * instructions? } }`).
 */
export const libraryExercise = (
  slug: string,
  overrides: Partial<FakeExercise & Exercise> = {}
): Exercise & FakeExercise => ({
  description: `About ${slug}.`,
  instructions: `- Do ${slug}.`,
  muscle_groups: ["chest"] as MuscleGroup[],
  name: slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" "),
  slug,
  thumbnail_url: `https://media.test/render/${slug}.jpg`,
  video_url: `https://media.test/${slug}.mp4`,
  ...overrides,
});

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
export const library: { current: Library } = {
  current: createFakeLibrary([]),
};

export const libraryModule = {
  getLibrary: (): Library => library.current,
};

/** Makes a fake over these Exercises (and Covers, none by default) the one the app reads. */
export const serveLibrary = (
  exercises: readonly FakeExercise[],
  options: { covers?: readonly Cover[] } = {}
): FakeLibrary => {
  const fake = createFakeLibrary(exercises, options);
  library.current = fake;
  return fake;
};
