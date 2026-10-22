import type { MuscleGroup } from "@fitme/core";
import type { Exercise, ExerciseLibrary } from "@fitme/exercise-library";
import {
  createFakeExerciseLibrary,
  type FakeExerciseLibrary,
} from "@fitme/exercise-library/fake";

/** A made-up Exercise of the Exercise Library, named in title case. */
export const libraryExercise = (
  slug: string,
  overrides: Partial<Exercise> = {}
): Exercise => ({
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
 * What `~/lib/exercise-library` exports in tests: point `current` at a fake
 * (or a real client on a stubbed `fetch`) per test.
 *
 *   jest.mock("~/lib/exercise-library", () =>
 *     jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
 *       "~/test-utils/fake-exercise-library"
 *     ).exerciseLibraryModule
 *   );
 */
export const library: { current: ExerciseLibrary } = {
  current: createFakeExerciseLibrary([]),
};

export const exerciseLibraryModule = {
  get exerciseLibrary() {
    return library.current;
  },
};

/** Makes a fake over these Exercises the one the app reads. */
export const serveLibrary = (
  exercises: readonly Exercise[]
): FakeExerciseLibrary => {
  const fake = createFakeExerciseLibrary(exercises);
  library.current = fake;
  return fake;
};
