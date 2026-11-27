/**
 * Runs in every test file after the framework is installed
 * (`jest.setupFilesAfterEnv` in package.json).
 */
import { afterEach, beforeAll } from "@jest/globals";

import { clearAddedSets } from "~/hooks/added-sets";
import { resetEquipmentChoices } from "~/hooks/equipment-choice";
import { resetMuscleChoices } from "~/hooks/muscle-choice";
import { closeOpenSetNote } from "~/hooks/open-set-note";
import { resetPlanDrafts } from "~/hooks/plan-draft";
import { overrideAnalyticsDecision } from "~/lib/analytics-decision";
import { resetFeatureFlags } from "~/lib/feature-flags";
import { resetDeviceLanguages } from "~/test-utils/device-locales";
import {
  resetSentAnalytics,
  TEST_POSTHOG_KEY,
} from "~/test-utils/fake-analytics";
import { fakeArnold } from "~/test-utils/fake-arnold";
import { fakeClerk } from "~/test-utils/fake-clerk";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import { resetHaptics } from "~/test-utils/haptics-stub";
import { clearTestQueryClients } from "~/test-utils/query-client";
import { resetSignedInUser } from "~/test-utils/signed-in-user";
import { resetToasts } from "~/test-utils/toast-stub";

// Drops each test's queries and mutations, with any timer they hold. Runs
// after @testing-library/react-native's own cleanup (registered when
// query-client.ts imports it, so first), once the screen is unmounted.
afterEach(() => {
  clearTestQueryClients();
});

// A request to a route the fake Public API doesn't implement fails the test
// that sent it, whatever the screen did with the 501.
afterEach(() => {
  const { unhandled } = fakePublicApi;
  fakePublicApi.reset();

  if (unhandled.length > 0) {
    throw new Error(
      `Fake Public API has no route for: ${unhandled.join(", ")}. Add it to test-utils/fake-public-api.ts.`
    );
  }
});

// The real `fetch` goes back in place for the next test, whether or not this
// one stood the fake Arnold in for it, and a request to a route the fake
// doesn't answer fails the test that sent it.
afterEach(() => {
  const { unhandled } = fakeArnold;
  fakeArnold.reset();

  if (unhandled.length > 0) {
    throw new Error(
      `Fake Arnold has no route for: ${unhandled.join(", ")}. Add it to test-utils/fake-arnold.ts.`
    );
  }
});

// Every test starts on an English device, whatever the last one set.
afterEach(() => {
  resetDeviceLanguages();
});

// Every test starts with no Muscle group chosen, as the app does: the Library
// tab's choice lives in memory, outliving its screen.
afterEach(() => {
  resetMuscleChoices();
  resetEquipmentChoices();
});

// Every test starts with no Plan editor draft, as the app does: a draft
// lives in memory, outliving the editor that made it.
afterEach(() => {
  resetPlanDrafts();
});

// Every test starts with no set added to a Workout Session, as the app does:
// an added set lives in memory until it's logged, outliving its screen.
afterEach(() => {
  clearAddedSets();
});

// Every test starts with no set's note open: which one is lives in memory,
// outliving its row.
afterEach(() => {
  closeOpenSetNote();
});

// Every test starts with a free RevenueCat customer, no restore counted or
// failing and no customer info listener left from the last one.
afterEach(() => {
  fakeRevenueCat.reset();
});

// Every test starts with the fake Clerk User as configured by default: its
// name, email addresses, providers and password, no call recorded, no
// failure queued and a fresh session. Before the signed-in User is reset,
// which signs that User back in.
afterEach(() => {
  fakeClerk.reset();
});

// Every test starts with the fake Public API's User signed in, whoever the
// last one signed in (`signInAs`).
afterEach(() => {
  resetSignedInUser();
});

// Every test starts with no toast on screen: the stand-in keeps each one
// until now, where the real one hides it after a few seconds.
afterEach(() => {
  resetToasts();
});

// The first test of a file starts with nothing recorded either: importing the
// wrapper builds its client before any test runs.
beforeAll(() => {
  resetSentAnalytics();
});

// Every test starts with nothing sent to analytics, and with the wrapper
// sending under the test key, whatever the last one switched
// (`overrideAnalyticsDecision`, `EXPO_PUBLIC_POSTHOG_KEY`).
afterEach(() => {
  resetSentAnalytics();
  process.env.EXPO_PUBLIC_POSTHOG_KEY = TEST_POSTHOG_KEY;
  overrideAnalyticsDecision(true);
});

// Every test starts with every feature flag as the build sets it (off), however
// the last one switched it.
afterEach(() => {
  resetFeatureFlags();
});

// Every test starts with no haptic recorded.
afterEach(() => {
  resetHaptics();
});
