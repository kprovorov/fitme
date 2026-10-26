import type { RequiredEnv } from "@fitme/observability/node";

/**
 * What a production deployment can't serve tools without; `src/app.ts`
 * reports each one missing at startup (`reportMissingEnv`).
 */
export const REQUIRED_ENV: readonly RequiredEnv[] = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "FITME_DATABASE_URL",
  "LIBRARY_URL",
  "LIBRARY_MCP_SECRET",
];
