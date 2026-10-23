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
  type ProfileUnits,
  type ProfileWithUnits,
} from "@fitme/services/profile";

/**
 * A read carrying weights, with the unit they're stored in: the User's
 * Profile's, read in the same transaction (`kg` without a Profile).
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
  listPlans: () => Promise<PlanSummary[]>;
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

  /** `read` and, when it finds something, the unit of its weights. */
  const weighed = <T>(read: (tx: Transaction) => Promise<T | null>) =>
    asUser(userId, async (tx): Promise<Weighed<T> | null> => {
      const value = await read(tx);
      if (value === null) {
        return null;
      }
      const profile = await getProfile(tx, userId);
      return { value, weightUnit: profile?.units.weight ?? "kg" };
    });

  return {
    getActivePlan: () => weighed((tx) => getActivePlan(tx, userId)),
    getPlan: (planId) => weighed((tx) => getPlan(tx, userId, planId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
  };
};
