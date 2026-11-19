import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't serve User data without; `src/app.ts`
 * reports each one missing at startup (`reportMissingEnv`). Upstash isn't
 * here: `createApp` already fails at startup in production without it.
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = [
  "CLERK_JWT_KEY",
  "FITME_DATABASE_URL",
  // The Library index's Blob store (ADR 0018): without it every write
  // carrying an Exercise slug answers 503.
  "BLOB_STORE_ID",
  // The new Library's media origin (ADR 0022): without it every Exercise's
  // thumbnail and video URL points at a placeholder project.
  "SUPABASE_URL",
];
