import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't clean up a deleted User without;
 * `src/app.ts` reports each one missing at startup (`reportMissingEnv`).
 * Arnold's URL and reset secret accept their pre-rename names, as
 * `arnoldResetConfig` reads them.
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = [
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "FITME_DATABASE_URL",
  ["ARNOLD_URL", "COACH_URL"],
  ["ARNOLD_RESET_SECRET", "COACH_RESET_SECRET"],
];
