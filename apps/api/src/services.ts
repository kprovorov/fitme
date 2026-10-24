import { asUser } from "@fitme/db";
import {
  getProfile,
  type ProfileChanges,
  type ProfileWithUnits,
  updateProfile,
} from "@fitme/services/profile";

/**
 * The services a verified User's requests call, each bound to that User and
 * run in its own `asUser` transaction (ADR 0003, ADR 0004). Routes never pass
 * a User id: it comes from the verified caller the services were built for.
 */
export interface UserServices {
  getProfile: () => Promise<ProfileWithUnits | null>;
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
  return {
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    updateProfile: (changes) =>
      asUser(userId, (tx) => updateProfile(tx, userId, changes)),
  };
};
