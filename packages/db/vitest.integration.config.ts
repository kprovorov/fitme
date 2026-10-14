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
    hookTimeout: 30_000,
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
