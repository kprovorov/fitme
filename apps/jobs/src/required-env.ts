import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't run a job without; each job's entry
 * reports each one missing at startup (`reportMissingEnv`).
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = ["FITME_DATABASE_URL"];
