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
  // The Library index's Blob store (ADR 0018): without it every tool writing
  // an Exercise slug asks the model to retry.
  "BLOB_STORE_ID",
  // Search and the Exercise names in reads stay on the Library API
  "LIBRARY_URL",
  "LIBRARY_ARNOLD_SECRET",
  "ARNOLD_RESET_SECRET",
];
