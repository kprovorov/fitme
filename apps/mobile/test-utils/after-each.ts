/**
 * Runs in every test file after the framework is installed
 * (`jest.setupFilesAfterEnv` in package.json).
 */
import { afterEach } from "@jest/globals";
import { clearTestQueryClients } from "~/test-utils/query-client";

// Drops each test's queries and mutations, with any timer they hold.
afterEach(() => {
  clearTestQueryClients();
});
