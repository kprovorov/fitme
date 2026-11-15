import { parseArgs } from "node:util";

import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import { sanitizeError } from "@fitme/observability";

import { backfillCovers } from "../src/backfill-covers.js";
import { libraryBundleSourceFromEnv } from "../src/library.js";

/**
 * The one-off Cover backfill (ADR 0014): `pnpm api backfill:covers
 * [--dry-run] [--plan <id>]…`. See README, Cover backfill.
 *
 * It sets `process.exitCode` rather than calling `process.exit`, so piped
 * output is flushed first; the database pool's idle clients let the process
 * end about 10 s after the run.
 */

/** A Plan id as Postgres accepts a uuid (`Id` in src/schemas.ts). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const run = async () => {
  const { values } = parseArgs({
    options: {
      "dry-run": { default: false, type: "boolean" },
      plan: { multiple: true, type: "string" },
    },
  });

  const badPlan = values.plan?.find((id) => !UUID.test(id));

  if (badPlan !== undefined) {
    console.error(`--plan ${badPlan} is not a Plan id (a uuid)`);

    return 1;
  }

  // Never the committed fixture: its made-up Covers would be written to real
  // Workouts for good, since a covered Workout is never changed again.
  if (
    !(process.env.VERCEL_ENV === "production" || process.env.LIBRARY_BUNDLE)
  ) {
    console.error(
      "Set VERCEL_ENV=production (with BLOB_STORE_ID, over Vercel OIDC) or LIBRARY_BUNDLE"
    );

    return 1;
  }

  const source = libraryBundleSourceFromEnv();
  console.log(`Library bundle: ${source.name}`);

  const index = createLibraryIndex({
    load: source.load,
    // One load for the whole run: a slug missing from it stays missing, so a
    // retry never downloads the bundle again.
    reloadIntervalMs: Number.POSITIVE_INFINITY,
    // The load's own failure, printed as the run's error would be; the run
    // then stops with LibraryIndexUnavailableError.
    reportError: (failure) => {
      console.error(sanitizeError(failure));
    },
  });

  try {
    await backfillCovers({
      dryRun: values["dry-run"],
      index,
      planIds: values.plan,
    });

    return 0;
  } catch (error) {
    // No SQL, parameters or Postgres message: they could echo User data
    console.error(sanitizeError(error));

    return 1;
  }
};

process.exitCode = await run();
