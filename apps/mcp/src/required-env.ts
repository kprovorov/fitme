import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't serve tools without; `src/app.ts`
 * reports each one missing at startup (`reportMissingEnv`).
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "FITME_DATABASE_URL",
  // The Blob store holding both bundles: without it list_exercises and
  // get_exercise answer "Library unavailable" (the Library, ADR 0022), and so
  // does every Plan write carrying Exercise slugs (the Library index, ADR 0018).
  "BLOB_STORE_ID",
  // The Library's media URLs (thumbnails, videos) are on this project.
  "SUPABASE_URL",
];
