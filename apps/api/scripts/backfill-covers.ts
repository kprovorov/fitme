import { parseArgs } from "node:util";
import { sanitizeError } from "@fitme/observability";
import { backfillCovers } from "../src/backfill-covers.js";
import { createLibraryFromEnv } from "../src/library.js";

/**
 * The one-off Cover backfill (ADR 0014): `pnpm api backfill:covers
 * [--dry-run] [--plan <id>]…`. See README, Cover backfill.
 */
const { values } = parseArgs({
  options: {
    "dry-run": { default: false, type: "boolean" },
    plan: { multiple: true, type: "string" },
  },
});

const library = createLibraryFromEnv();
if (!library) {
  console.error("Set LIBRARY_URL and LIBRARY_PUBLIC_API_SECRET");
  process.exit(1);
}

try {
  await backfillCovers({
    dryRun: values["dry-run"],
    library,
    planIds: values.plan,
  });
  process.exit(0);
} catch (error) {
  // No SQL, parameters or Postgres message: they could echo User data
  console.error(sanitizeError(error));
  process.exit(1);
}
