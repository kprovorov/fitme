import { sanitizeError } from "@fitme/observability";

import { forgottenWorkoutSessions } from "./jobs/forgotten-workout-sessions.js";

/**
 * One run of the job by hand (`pnpm jobs job:forgotten-workout-sessions`),
 * against the database in this checkout's `.env`. It sets `process.exitCode`
 * rather than calling `process.exit`, so piped output is flushed first; the
 * database pool's idle clients let the process end about 10 s after the run.
 */
try {
  await forgottenWorkoutSessions()();
} catch (error) {
  // No SQL, parameters or Postgres message: they could echo User data
  console.error(sanitizeError(error).error);
  process.exitCode = 1;
}
