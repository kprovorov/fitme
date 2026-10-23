import { asUser, type Transaction } from "@fitme/db";
import {
  getProfile,
  type ProfileUnits,
  type ProfileWithUnits,
} from "@fitme/services/profile";
import {
  getWorkoutSession,
  type ListWorkoutSessionsOptions,
  listWorkoutSessions,
  type WorkoutSessionDetail,
  type WorkoutSessionPage,
} from "@fitme/services/workout-sessions";

/** A read carrying weights, with the unit they're stored and shown in. */
export type WithWeightUnit<T> = T & { weight_unit: ProfileUnits["weight"] };

/**
 * The services a verified User's requests call, each bound to that User and
 * run in its own `asUser` transaction (ADR 0003, ADR 0004). Routes never pass
 * a User id: it comes from the verified caller the services were built for.
 */
export interface UserServices {
  getProfile: () => Promise<ProfileWithUnits | null>;
  getWorkoutSession: (
    sessionId: string
  ) => Promise<WithWeightUnit<WorkoutSessionDetail> | null>;
  listWorkoutSessions: (
    options: ListWorkoutSessionsOptions
  ) => Promise<WorkoutSessionPage>;
}

/**
 * Builds the services for a verified User id, or returns `null` when the API
 * isn't configured for the database.
 */
export type ServicesFactory = (userId: string) => UserServices | null;

/**
 * The User's weight unit, read in the same transaction as the weights it
 * describes: `kg` without a Profile (an unknown system counts as metric).
 */
const weightUnitOf = async (
  tx: Transaction,
  userId: string
): Promise<ProfileUnits["weight"]> =>
  (await getProfile(tx, userId))?.units.weight ?? "kg";

/** Services on the `fitme` login through the pooler (`FITME_DATABASE_URL`). */
export const createServicesFromEnv: ServicesFactory = (userId) => {
  if (!process.env.FITME_DATABASE_URL) {
    return null;
  }
  return {
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      asUser(userId, async (tx) => {
        const session = await getWorkoutSession(tx, sessionId);
        if (!session) {
          return null;
        }
        return { ...session, weight_unit: await weightUnitOf(tx, userId) };
      }),
    listWorkoutSessions: (options) =>
      asUser(userId, (tx) => listWorkoutSessions(tx, options)),
  };
};
