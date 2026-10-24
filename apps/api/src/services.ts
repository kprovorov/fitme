import { asUser, type Transaction } from "@fitme/db";
import {
  getActivePlan,
  getPlan,
  listPlans,
  type PlanDetail,
  type PlanSummary,
} from "@fitme/services/plans";
import {
  getProfile,
  lockProfileUnits,
  type ProfileChanges,
  type ProfileUnits,
  type ProfileWithUnits,
  updateProfile,
} from "@fitme/services/profile";
import {
  getWorkoutSession,
  type ListWorkoutSessionsOptions,
  listWorkoutSessions,
  type WorkoutSessionDetail,
  type WorkoutSessionPage,
} from "@fitme/services/workout-sessions";

/**
 * A read carrying weights, with the unit they're stored in: the User's
 * Profile's (`kg` without a Profile), locked in the same transaction before
 * the read, so no conversion can commit in between.
 */
export interface Weighed<T> {
  value: T;
  weightUnit: ProfileUnits["weight"];
}

/**
 * The services a verified User's requests call, each bound to that User and
 * run in its own `asUser` transaction (ADR 0003, ADR 0004). Routes never pass
 * a User id: it comes from the verified caller the services were built for.
 */
export interface UserServices {
  /** The active Plan in full, or `null` with none. */
  getActivePlan: () => Promise<Weighed<PlanDetail> | null>;
  /** A live Plan of the User in full, or `null` (missing, deleted, foreign). */
  getPlan: (planId: string) => Promise<Weighed<PlanDetail> | null>;
  getProfile: () => Promise<ProfileWithUnits | null>;
  /** One of the User's Workout Sessions in full, or `null` (missing, foreign). */
  getWorkoutSession: (
    sessionId: string
  ) => Promise<Weighed<WorkoutSessionDetail> | null>;
  listPlans: () => Promise<PlanSummary[]>;
  listWorkoutSessions: (
    options: ListWorkoutSessionsOptions
  ) => Promise<WorkoutSessionPage>;
  /** The updated Profile, or `null` with nothing changed without one. */
  updateProfile: (changes: ProfileChanges) => Promise<ProfileWithUnits | null>;
}

/**
 * Builds the services for a verified User id, or returns `null` when the API
 * isn't configured for the database.
 */
export type ServicesFactory = (userId: string) => UserServices | null;

/** Services on the `fitme` login through the pooler (`FITME_DATABASE_URL`). */
export const createServicesFromEnv: ServicesFactory = (userId) => {
  if (!process.env.FITME_DATABASE_URL) {
    return null;
  }

  /** `read`, after locking the units its weights are in. */
  const weighed = <T>(read: (tx: Transaction) => Promise<T | null>) =>
    asUser(userId, async (tx): Promise<Weighed<T> | null> => {
      const units = await lockProfileUnits(tx, userId);
      const value = await read(tx);
      return value === null
        ? null
        : { value, weightUnit: units?.weight ?? "kg" };
    });

  return {
    getActivePlan: () => weighed((tx) => getActivePlan(tx, userId)),
    getPlan: (planId) => weighed((tx) => getPlan(tx, userId, planId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      weighed((tx) => getWorkoutSession(tx, sessionId)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
    listWorkoutSessions: (options) =>
      asUser(userId, (tx) => listWorkoutSessions(tx, options)),
    updateProfile: (changes) =>
      asUser(userId, (tx) => updateProfile(tx, userId, changes)),
  };
};
