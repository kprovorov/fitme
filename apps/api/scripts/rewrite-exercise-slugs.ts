import { parseArgs } from "node:util";

import { libraryV2BundleSource } from "@fitme/library-bundle/v2/source";
import { sanitizeError } from "@fitme/observability";

import {
  readReplacedSlugs,
  rewriteExerciseSlugs,
} from "../src/rewrite-exercise-slugs.js";

/**
 * The one-off Exercise slug rewrite (ADR 0022): `pnpm api
 * rewrite:exercise-slugs [--dry-run]`. See README, Slug rewrite.
 *
 * It sets `process.exitCode` rather than calling `process.exit`, so piped
 * output is flushed first; the database pool's idle clients let the process
 * end about 10 s after the run.
 */
const run = async () => {
  const { values } = parseArgs({
    options: { "dry-run": { default: false, type: "boolean" } },
  });

  // Never the committed fixture: its made-up map would rewrite real slugs
  // for good, since a rewritten slug is never changed back.
  if (
    !(process.env.VERCEL_ENV === "production" || process.env.LIBRARY_V2_BUNDLE)
  ) {
    console.error(
      "Set VERCEL_ENV=production (with BLOB_STORE_ID, over Vercel OIDC) or LIBRARY_V2_BUNDLE"
    );

    return 1;
  }

  const source = libraryV2BundleSource({
    env: {
      BLOB_STORE_ID: process.env.BLOB_STORE_ID,
      LIBRARY_V2_BUNDLE: process.env.LIBRARY_V2_BUNDLE,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });

  console.log(`Library v2 bundle: ${source.name}`);

  try {
    const map = readReplacedSlugs(await source.load());
    console.log(`Slug map: ${Object.keys(map).length} old slugs`);

    await rewriteExerciseSlugs({ dryRun: values["dry-run"], map });

    return 0;
  } catch (error) {
    // No SQL, parameters or Postgres message: they could echo User data
    console.error(sanitizeError(error));

    return 1;
  }
};

process.exitCode = await run();
