import { asUser } from "@fitme/db";
import {
  type Exercise,
  type ExerciseHistoryEntry,
  type ExerciseHistoryQuery,
  type ExercisePage,
  type ExerciseQuery,
  getExercise,
  getExerciseHistory,
  listExercises,
} from "@fitme/services/exercises";
import {
  type DeletedPlan,
  deletePlan,
  getPlan,
  listPlans,
  type PlanDetail,
  type PlanSummary,
} from "@fitme/services/plans";
import { getProfile, type ProfileWithUnits } from "@fitme/services/profile";

/**
 * The services a User's tools call, each bound to that User and run in its
 * own `asUser` transaction (ADR 0003, ADR 0004). Tools never pass a User id:
 * it comes from the verified Clerk token the services were built for.
 */
export interface UserServices {
  deletePlan: (planId: string) => Promise<DeletedPlan | null>;
  getExercise: (exerciseId: string) => Promise<Exercise | null>;
  getExerciseHistory: (
    query: ExerciseHistoryQuery
  ) => Promise<ExerciseHistoryEntry[]>;
  getPlan: (planId: string) => Promise<PlanDetail | null>;
  getProfile: () => Promise<ProfileWithUnits | null>;
  listExercises: (query: ExerciseQuery) => Promise<ExercisePage>;
  listPlans: () => Promise<PlanSummary[]>;
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
    deletePlan: (planId) =>
      asUser(userId, (tx) => deletePlan(tx, userId, planId)),
    getExercise: (exerciseId) =>
      asUser(userId, (tx) => getExercise(tx, exerciseId)),
    getExerciseHistory: (query) =>
      asUser(userId, (tx) => getExerciseHistory(tx, userId, query)),
    getPlan: (planId) => asUser(userId, (tx) => getPlan(tx, userId, planId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    listExercises: (query) => asUser(userId, (tx) => listExercises(tx, query)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
  };
};
