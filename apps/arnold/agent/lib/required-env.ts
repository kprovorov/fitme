import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't serve Conversations (or reset them for
 * account deletion) without; `agent/instrumentation/sentry.ts` reports each
 * one missing at startup (`reportMissingEnv`).
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = [
  "CLERK_JWT_KEY",
  "REVENUECAT_SECRET_KEY",
  "FITME_DATABASE_URL",
  // The Blob store holding the new Library's bundle (ADR 0022): without it
  // every tool writing an Exercise slug, and search_exercises, asks the model
  // to retry, and reads name Exercises from their slugs.
  "BLOB_STORE_ID",
  "ARNOLD_RESET_SECRET",
];
