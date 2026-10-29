/**
 * Runs before every test file (`jest.setupFiles` in package.json).
 *
 * Every test reads the Library through the in-memory fake, never the
 * network: a component that calls `useExercises` in a test that forgot to mock
 * `~/lib/library` would otherwise send real requests and keep Jest
 * from exiting. A test points the fake at its Exercises with `serveLibrary`.
 *
 * The Public API client (`~/lib/public-api`) is the real one
 * (`~/lib/api/client`, without the Clerk token getter), its `fetch` the
 * fake Public API (`fake-public-api.ts`), which answers over the fake Supabase
 * backend's rows and fails any route it doesn't implement, so no write reaches
 * the network either. Its base URL is the fake's `baseUrl`.
 *
 * `@sentry/react-native` is a stand-in too: importing the real SDK starts a
 * cleanup `setInterval` (`AsyncExpiringMap` in `timeToDisplayFallback`) that
 * keeps Jest alive for seconds after the last test. A test file that checks
 * what's reported mocks it again with its own `jest.fn`s.
 *
 * `expo-localization` reports an English device (`en-US`), so every screen
 * renders in English; a test sets another device language with
 * `setDeviceLanguages` (`device-locales.ts`).
 */
import { jest } from "@jest/globals";

jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-library")>(
      "~/test-utils/fake-library"
    ).libraryModule
);
jest.mock("~/lib/public-api", () => {
  const { createPublicApi } =
    jest.requireActual<typeof import("~/lib/api/client")>("~/lib/api/client");
  const { FAKE_SESSION_TOKEN, fakePublicApi } = jest.requireActual<
    typeof import("~/test-utils/fake-public-api")
  >("~/test-utils/fake-public-api");
  return {
    publicApi: createPublicApi({
      baseUrl: () => fakePublicApi.baseUrl,
      fetch: fakePublicApi.fetch,
      token: async () => FAKE_SESSION_TOKEN,
    }),
  };
});
jest.mock(
  "expo-localization",
  () =>
    jest.requireActual<typeof import("~/test-utils/device-locales")>(
      "~/test-utils/device-locales"
    ).localizationModule
);
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  setUser: jest.fn(),
}));
