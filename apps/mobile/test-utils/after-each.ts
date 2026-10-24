/**
 * Runs in every test file after the framework is installed
 * (`jest.setupFilesAfterEnv` in package.json).
 */
import { afterEach } from "@jest/globals";
import { fakePublicApi } from "~/test-utils/fake-public-api";
import { clearTestQueryClients } from "~/test-utils/query-client";

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
