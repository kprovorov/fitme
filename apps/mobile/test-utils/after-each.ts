/**
 * Runs in every test file after the framework is installed
 * (`jest.setupFilesAfterEnv` in package.json).
 */
import { afterEach } from "@jest/globals";
import { clearTestQueryClients } from "~/test-utils/query-client";

// Drops each test's queries and mutations, with any timer they hold. Runs
// after @testing-library/react-native's own cleanup (registered when
// query-client.ts imports it, so first), once the screen is unmounted.
afterEach(() => {
  clearTestQueryClients();
});
