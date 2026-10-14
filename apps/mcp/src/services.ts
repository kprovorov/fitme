import { asUser } from "@fitme/db";
import { getProfile, type ProfileWithUnits } from "@fitme/services/profile";
import {
  deleteWorkoutSession,
  getWorkoutSession,
  type ListWorkoutSessionsOptions,
  type LogSetInput,
  type LogSetResult,
  listWorkoutSessions,
  logSet,
  type WorkoutSessionDetail,
  type WorkoutSessionPage,
} from "@fitme/services/workout-sessions";

/**
 * The services a User's tools call, each bound to that User and run in its
 * own `asUser` transaction (ADR 0003, ADR 0004). Tools never pass a User id:
 * it comes from the verified Clerk token the services were built for.
 */
export interface UserServices {
  deleteWorkoutSession: (sessionId: string) => Promise<boolean>;
  getProfile: () => Promise<ProfileWithUnits | null>;
  getWorkoutSession: (
    sessionId: string
  ) => Promise<WorkoutSessionDetail | null>;
  listWorkoutSessions: (
    options: ListWorkoutSessionsOptions
  ) => Promise<WorkoutSessionPage>;
  logSet: (input: LogSetInput) => Promise<LogSetResult>;
}

/**
 * Builds the services for a verified User id, or returns `null` when the
 * server isn't configured for the database.
 */
export type ServicesFactory = (userId: string) => UserServices | null;

/** Services on the `fitme` login through the pooler (`FITME_DATABASE_URL`). */
export const createServicesFromEnv: ServicesFactory = (userId) => {
  if (!process.env.FITME_DATABASE_URL) {
    return null;
  }
  return {
    deleteWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => deleteWorkoutSession(tx, sessionId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => getWorkoutSession(tx, sessionId)),
    listWorkoutSessions: (options) =>
      asUser(userId, (tx) => listWorkoutSessions(tx, options)),
    logSet: (input) => asUser(userId, (tx) => logSet(tx, input)),
  };
};
