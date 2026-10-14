import { defineConfig } from "drizzle-kit";
import { localAdminDatabaseUrl } from "./integration/local-database-url";

/**
 * Only for `drizzle-kit pull`, run by `pnpm --filter @fitme/db schema:generate`.
 * The Supabase SQL migrations own the schema (ADR 0004): never run
 * `drizzle-kit generate`, `migrate` or `push` against this config.
 */
export default defineConfig({
  dbCredentials: { url: localAdminDatabaseUrl() },
  dialect: "postgresql",
  // Scratch output; scripts/generate-schema.ts copies what it needs into src/
  out: ".drizzle",
  schemaFilter: ["public", "private"],
});
