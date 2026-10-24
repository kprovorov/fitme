import { defineConfig } from "vitest/config";
import { localDatabaseUrl } from "./integration/local-database-url";

/**
 * Runs against a local Supabase stack through its Supavisor pooler, as the
 * fitme login. FITME_DATABASE_URL overrides the running stack's URL.
 */
export default defineConfig({
  test: {
    env: {
      FITME_DATABASE_URL:
        process.env.FITME_DATABASE_URL ?? localDatabaseUrl("fitme-db-tests"),
    },
    // A deprecation fails the run: pg's "client.query() when the client is
    // already executing a query" means two statements raced on one connection
    execArgv: ["--throw-deprecation"],
    // Warms the pooler first: test files connecting to a cold one at once
    // time out their hooks on the first run after a stack start
    globalSetup: ["./integration/wait-for-pooler.ts"],
    hookTimeout: 30_000,
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
