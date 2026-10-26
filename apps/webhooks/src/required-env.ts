import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't clean up a deleted User without;
 * `src/app.ts` reports each one missing at startup (`reportMissingEnv`).
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = [
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "FITME_DATABASE_URL",
  "ARNOLD_URL",
  "ARNOLD_RESET_SECRET",
];
