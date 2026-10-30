import { parseArgs } from "node:util";
import { sanitizeError } from "@fitme/observability";
import { backfillCovers } from "../src/backfill-covers.js";
import { createLibraryFromEnv } from "../src/library.js";

/**
 * The one-off Cover backfill (ADR 0014): `pnpm api backfill:covers
 * [--dry-run] [--plan <id>]…`. See README, Cover backfill.
 *
 * It sets `process.exitCode` rather than calling `process.exit`, so piped
 * output is flushed first; the database pool's idle clients let the process
 * end about 10 s after the run.
 */

/** A Plan id as Postgres accepts a uuid (`Id` in src/schemas.ts). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const library = createLibraryFromEnv();
  if (!library) {
    console.error("Set LIBRARY_URL and LIBRARY_PUBLIC_API_SECRET");
    return 1;
  }
  try {
    await backfillCovers({
      dryRun: values["dry-run"],
      library,
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
