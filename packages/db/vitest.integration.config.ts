import { defineConfig } from "vitest/config";

/**
 * Runs against a local Supabase stack through its Supavisor pooler, as the
 * fitme login with the development password from supabase/roles.sql.
 */
const localDatabaseUrl =
  "postgresql://fitme.pooler-dev:fitme-local-only@127.0.0.1:54329/postgres?application_name=fitme-db-tests";

export default defineConfig({
  test: {
    env: {
      FITME_DATABASE_URL: process.env.FITME_DATABASE_URL ?? localDatabaseUrl,
    },
    hookTimeout: 30_000,
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
