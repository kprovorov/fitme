import { defineConfig } from "vitest/config";

/** Runs against a live Supabase stack; see README, Integration tests. */
export default defineConfig({
  test: {
    hookTimeout: 30_000,
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
