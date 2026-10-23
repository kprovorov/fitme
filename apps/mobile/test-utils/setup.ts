/**
 * Runs before every test file (`jest.setupFiles` in package.json).
 *
 * Every test reads the Exercise Library through the in-memory fake, never the
 * network: a component that calls `useExercises` in a test that forgot to mock
 * `~/lib/exercise-library` would otherwise send real requests and keep Jest
 * from exiting. A test points the fake at its Exercises with `serveLibrary`.
 */
import { jest } from "@jest/globals";

jest.mock(
  "~/lib/exercise-library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
      "~/test-utils/fake-exercise-library"
    ).exerciseLibraryModule
);
