/**
 * Runs before every test file (`jest.setupFiles` in package.json).
 *
 * Every test reads the Exercise Library through the in-memory fake, never the
 * network: a component that calls `useExercises` in a test that forgot to mock
 * `~/lib/exercise-library` would otherwise send real requests and keep Jest
 * from exiting. A test points the fake at its Exercises with `serveLibrary`.
 *
 * `@sentry/react-native` is a stand-in too: importing the real SDK starts a
 * cleanup `setInterval` (`AsyncExpiringMap` in `timeToDisplayFallback`) that
 * keeps Jest alive for seconds after the last test. A test file that checks
 * what's reported mocks it again with its own `jest.fn`s.
 */
import { jest } from "@jest/globals";

jest.mock(
  "~/lib/exercise-library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-exercise-library")>(
      "~/test-utils/fake-exercise-library"
    ).exerciseLibraryModule
);
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  setUser: jest.fn(),
}));
