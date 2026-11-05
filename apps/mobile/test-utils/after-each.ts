/**
 * Runs in every test file after the framework is installed
 * (`jest.setupFilesAfterEnv` in package.json).
 */
import { afterEach } from "@jest/globals";

import { resetMuscleChoices } from "~/hooks/muscle-choice";
import { resetPlanDrafts } from "~/hooks/plan-draft";
import { resetDeviceLanguages } from "~/test-utils/device-locales";
import { fakeArnold } from "~/test-utils/fake-arnold";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { clearTestQueryClients } from "~/test-utils/query-client";
import { resetSignedInUser } from "~/test-utils/signed-in-user";

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
});

// Every test starts with no Plan editor draft, as the app does: a draft
// lives in memory, outliving the editor that made it.
afterEach(() => {
  resetPlanDrafts();
});

// Every test starts with the fake Public API's User signed in, whoever the
// last one signed in (`signInAs`).
afterEach(() => {
  resetSignedInUser();
});
