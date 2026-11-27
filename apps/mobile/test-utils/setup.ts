/**
 * Runs before every test file (`jest.setupFiles` in package.json).
 *
 * Every test reads the Library API (now only its Covers) through the
 * in-memory fake, never the network: a component that calls `useCovers` in a
 * test that forgot to mock `~/lib/library` would otherwise send real requests
 * and keep Jest from exiting. A test points the fake at its Covers with
 * `serveLibrary(covers)`; Exercises come from the fake Public API
 * (`serveExercises` in `fake-exercises.ts`).
 *
 * The Public API clients (`~/lib/public-api`: `publicApi`, and `globalApi`,
 * sending no bearer) are the real one (`@fitme/api-client`, without the
 * Clerk token getter), their `fetch` the fake Public API
 * (`fake-public-api.ts`), which answers over its own in-memory rows and fails
 * any route it doesn't implement, so no read or write reaches the network
 * either. Its base URL is the fake's `baseUrl`.
 *
 * `@sentry/react-native` is a stand-in too: importing the real SDK starts a
 * cleanup `setInterval` (`AsyncExpiringMap` in `timeToDisplayFallback`) that
 * keeps Jest alive for seconds after the last test. A test file that checks
 * what's reported mocks it again with its own `jest.fn`s.
 *
 * `sonner-native` is `toast-stub.tsx`: `toast.custom` keeps each toast and
 * its `Toaster` renders them all, so a test that renders the app's `Toaster`
 * (`~/components/ui/toast`) beside its Screen reads a toast's text.
 *
 * `~/components/ui/swipeable-row` is `swipeable-row-stub.tsx`: Jest can't
 * drive the real row's pan gesture, so a test presses the stand-in's hidden
 * open and full-swipe controls instead.
 *
 * `@segment/analytics-react-native` is the fake analytics SDK
 * (`fake-analytics.ts`), recording what reached it, and the analytics wrapper's
 * on/off decision is on (`overrideAnalyticsDecision`), since every build is a
 * development build under Jest: a test reads what the app sent through
 * `sentAnalytics`.
 *
 * `expo-localization` reports an English device (`en-US`), so every screen
 * renders in English; a test sets another device language with
 * `setDeviceLanguages` (`device-locales.ts`).
 *
 * `useTranslation()` gets an English i18next instance, so a test can render
 * a screen or component on its own, without the root layout that loads
 * `~/lib/i18n` in the app. A test that loads `~/lib/i18n` (to follow the
 * device language through `useAppLanguageSync`) binds that instance instead.
 */
import type * as ApiClient from "@fitme/api-client";
import { createI18n } from "@fitme/i18n";
import { jest } from "@jest/globals";
import { setI18n } from "react-i18next";

import { overrideAnalyticsDecision } from "~/lib/analytics-decision";
import type * as DeviceLocales from "~/test-utils/device-locales";
import type * as FakeAnalytics from "~/test-utils/fake-analytics";
import type * as FakeLibrary from "~/test-utils/fake-library";
import type * as FakePublicApi from "~/test-utils/fake-public-api";
import type * as SwipeableRowStub from "~/test-utils/swipeable-row-stub";
import type * as ToastStub from "~/test-utils/toast-stub";

setI18n(createI18n("en"));

overrideAnalyticsDecision(true);

jest.mock(
  "@segment/analytics-react-native",
  () =>
    jest.requireActual<typeof FakeAnalytics>("~/test-utils/fake-analytics")
      .analyticsSdkModule
);

jest.mock(
  "~/lib/library",
  () =>
    jest.requireActual<typeof FakeLibrary>("~/test-utils/fake-library")
      .libraryModule
);

jest.mock("~/lib/public-api", () => {
  const { createPublicApi } =
    jest.requireActual<typeof ApiClient>("@fitme/api-client");

  const { FAKE_SESSION_TOKEN, fakePublicApi } = jest.requireActual<
    typeof FakePublicApi
  >("~/test-utils/fake-public-api");

  return {
    globalApi: createPublicApi({
      baseUrl: () => fakePublicApi.baseUrl,
      fetch: fakePublicApi.fetch,
      token: () => Promise.resolve(null),
    }),
    publicApi: createPublicApi({
      baseUrl: () => fakePublicApi.baseUrl,
      fetch: fakePublicApi.fetch,
      token: () => Promise.resolve(FAKE_SESSION_TOKEN),
    }),
  };
});

jest.mock(
  "expo-localization",
  () =>
    jest.requireActual<typeof DeviceLocales>("~/test-utils/device-locales")
      .localizationModule
);

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  setUser: jest.fn(),
}));

jest.mock("~/components/ui/swipeable-row", () =>
  jest.requireActual<typeof SwipeableRowStub>("~/test-utils/swipeable-row-stub")
);

jest.mock(
  "sonner-native",
  () =>
    jest.requireActual<typeof ToastStub>("~/test-utils/toast-stub").sonnerModule
);
