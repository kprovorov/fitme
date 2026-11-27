import { parseArgs } from "node:util";

import { sanitizeError } from "@fitme/observability";

import {
  mergeIdentities,
  postHogMerge,
  readIdentityPairs,
  runRefusal,
} from "../src/merge-identities.js";

/**
 * The one-off identity merge in PostHog: `pnpm api merge:identities
 * [--dry-run] [--only <uuid>]… [--not-production]`. See README, Identity
 * merge.
 *
 * It sets `process.exitCode` rather than calling `process.exit`, so piped
 * output is flushed first; the database pool's idle clients let the process
 * end about 10 s after the run.
 */
const run = async () => {
  const { values } = parseArgs({
    options: {
      "dry-run": { default: false, type: "boolean" },
      "not-production": { default: false, type: "boolean" },
      only: { multiple: true, type: "string" },
    },
  });

  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;

  const refusal = runRefusal({
    apiKey,
    notProduction: values["not-production"],
    vercelEnv: process.env.VERCEL_ENV,
  });

  if (refusal !== null || apiKey === undefined) {
    console.error(refusal);

    return 1;
  }

  try {
    const { failed } = await mergeIdentities({
      dryRun: values["dry-run"],
      only: values.only,
      readPairs: readIdentityPairs,
      sendMerge: postHogMerge({ apiKey }),
    });

    return failed.length > 0 ? 1 : 0;
  } catch (error) {
    // No SQL, parameters or Postgres message: they could echo User data
    console.error(sanitizeError(error).error);

    return 1;
  }
};

process.exitCode = await run();
