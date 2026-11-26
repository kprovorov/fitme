import { sanitizeError } from "@fitme/observability";

import { forgottenWorkoutSessions } from "./jobs/forgotten-workout-sessions.js";
import { isLocalDatabaseUrl } from "./local-database.js";

/**
 * One real run of the job by hand (`pnpm jobs job:forgotten-workout-sessions`),
 * against the database in this checkout's `.env`, which must be a local one.
 * It sets `process.exitCode` rather than calling `process.exit`, so piped
 * output is flushed first; the database pool's idle clients let the process
 * end about 10 s after the run.
 */
if (isLocalDatabaseUrl(process.env.FITME_DATABASE_URL)) {
  try {
    await forgottenWorkoutSessions()();
  } catch (error) {
    // No SQL, parameters or Postgres message: they could echo User data
    console.error(sanitizeError(error).error);
    process.exitCode = 1;
  }
} else {
  console.error(
    "FITME_DATABASE_URL isn't a local database: this command only runs against the checkout's own stack."
  );
  process.exitCode = 1;
}
