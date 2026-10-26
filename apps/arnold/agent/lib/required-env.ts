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
  "LIBRARY_URL",
  "LIBRARY_ARNOLD_SECRET",
  "ARNOLD_RESET_SECRET",
];
