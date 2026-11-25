import { withService } from "@fitme/db";
import { sql } from "drizzle-orm";

import type { Job } from "../job.js";

export interface ForgottenWorkoutSessionsDeps {
  log: (message: string) => void;
  /** Reaches Postgres, rejecting when it can't. */
  pingDatabase: () => Promise<void>;
}

/** The real dependencies: the database through withService, the console. */
const defaultDeps = (): ForgottenWorkoutSessionsDeps => ({
  log: (message) => {
    console.info(message);
  },
  pingDatabase: async () => {
    await withService(async (tx) => await tx.execute(sql`select 1`));
  },
});

/**
 * Will close Forgotten Workout Sessions (ADR 0024, FIT-817). For now it only
 * proves it can reach Postgres and says that it ran.
 */
export const forgottenWorkoutSessions =
  ({ log, pingDatabase }: ForgottenWorkoutSessionsDeps = defaultDeps()): Job =>
  async () => {
    await pingDatabase();
    log("forgotten-workout-sessions ran");
  };
