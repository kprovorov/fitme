import { localDatabaseUrl } from "@fitme/db/local-database-url";
import { defineConfig } from "vitest/config";

/**
 * Runs against a live Supabase stack; see README, Integration tests. Tools on
 * services reach it through its Supavisor pooler as the fitme login;
 * FITME_DATABASE_URL overrides the running stack's URL.
 */
export default defineConfig({
  test: {
    env: {
      FITME_DATABASE_URL:
        process.env.FITME_DATABASE_URL ?? localDatabaseUrl("fitme-mcp-tests"),
    },
    hookTimeout: 30_000,
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
