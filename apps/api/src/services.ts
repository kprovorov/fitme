import { asUser, type Transaction } from "@fitme/db";
import {
  activatePlan,
  type CreatePlanOptions,
  createPlan,
  type DeletedPlan,
  deletePlan,
  getActivePlan,
  getPlan,
  listPlans,
  type NewPlan,
  type PlanDetail,
  type PlanMetadata,
  type PlanSummary,
  type PlanWorkoutInput,
  updatePlan,
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
  deleteWorkoutSession,
  type FinishWorkoutSessionResult,
  finishWorkoutSession,
  getWorkoutSession,
  type ListWorkoutSessionsOptions,
  type LogSetInput,
  type LogSetResult,
  listWorkoutSessions,
  logSet,
  type StartWorkoutSessionResult,
  startWorkoutSession,
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
  /**
   * Makes a live Plan of the User the active one, every other Plan of theirs
   * inactive; the Plan in full, or `null` with nothing changed (missing,
   * deleted, foreign).
   */
  activatePlan: (planId: string) => Promise<Weighed<PlanDetail> | null>;
  /**
   * Creates a Plan with its Workouts, Exercises and sets in one transaction,
   * active unless `activate: false`; the Plan in full. Its Exercise slugs are
   * checked before, not here (ADR 0010).
   */
  createPlan: (
    plan: NewPlan,
    options: CreatePlanOptions
  ) => Promise<Weighed<PlanDetail>>;
  /**
   * Soft-deletes a Plan of the User (its Workout Sessions stay); one already
   * deleted answers `alreadyDeleted`, and `null` means the User never had it.
   */
  deletePlan: (planId: string) => Promise<DeletedPlan | null>;
  /** Deletes one of the User's Workout Sessions; false when none matched. */
  deleteWorkoutSession: (sessionId: string) => Promise<boolean>;
  /**
   * Finishes one of the User's Workout Sessions and moves its Workout to the
   * end of the Plan's rotation; a repeat changes nothing (`alreadyFinished`).
   */
  finishWorkoutSession: (
    sessionId: string
  ) => Promise<Weighed<FinishWorkoutSessionResult>>;
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
  /** Logs one set of the User's open Workout Session, its weight in the User's unit. */
  logSet: (input: LogSetInput) => Promise<Weighed<LogSetResult>>;
  /**
   * Replaces every Workout of a live Plan of the User, in rotation order (new
   * ids; metadata and active state stay); the Plan in full, or `null` with
   * nothing changed (missing, deleted, foreign). Its Exercise slugs are
   * checked before, not here (ADR 0010).
   */
  replaceWorkouts: (
    planId: string,
    workouts: PlanWorkoutInput[]
  ) => Promise<Weighed<PlanDetail> | null>;
  /**
   * Starts a Workout Session for one of the User's Workouts (of a live Plan),
   * or resumes the one already open for it (`resumed`).
   */
  startWorkoutSession: (
    workoutId: string
  ) => Promise<Weighed<StartWorkoutSessionResult>>;
   * Changes only the given metadata fields of a live Plan of the User; its
   * Workouts and their ids stay. The Plan in full, or `null` with nothing
   * changed (missing, deleted, foreign).
   */
  updatePlan: (
    planId: string,
    changes: Partial<PlanMetadata>
  ) => Promise<Weighed<PlanDetail> | null>;
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

  /** `run`, after locking the units its weights are in. */
  const inUnits = <T>(run: (tx: Transaction) => Promise<T>) =>
    asUser(userId, async (tx): Promise<Weighed<T>> => {
      const units = await lockProfileUnits(tx, userId);
      return { value: await run(tx), weightUnit: units?.weight ?? "kg" };
    });

  /** `read` in its units, or `null` when it finds nothing. */
  const weighed = async <T>(read: (tx: Transaction) => Promise<T | null>) => {
    const { value, weightUnit } = await inUnits(read);
    return value === null ? null : { value, weightUnit };
  };

  return {
    // Activated and read back in one transaction, so the answer is the Plan
    // this request activated.
    activatePlan: (planId) =>
      weighed(async (tx) =>
        (await activatePlan(tx, userId, planId))
          ? getPlan(tx, userId, planId)
          : null
      ),
    createPlan: (plan, options) =>
      inUnits((tx) => createPlan(tx, userId, plan, options)),
    deletePlan: (planId) =>
      asUser(userId, (tx) => deletePlan(tx, userId, planId)),
    deleteWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => deleteWorkoutSession(tx, sessionId)),
    finishWorkoutSession: (sessionId) =>
      inUnits((tx) => finishWorkoutSession(tx, sessionId)),
    getActivePlan: () => weighed((tx) => getActivePlan(tx, userId)),
    getPlan: (planId) => weighed((tx) => getPlan(tx, userId, planId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      weighed((tx) => getWorkoutSession(tx, sessionId)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
    listWorkoutSessions: (options) =>
      asUser(userId, (tx) => listWorkoutSessions(tx, options)),
    logSet: (input) => inUnits((tx) => logSet(tx, input)),
    replaceWorkouts: (planId, workouts) =>
      weighed((tx) => updatePlan(tx, userId, planId, { workouts })),
    startWorkoutSession: (workoutId) =>
      inUnits((tx) => startWorkoutSession(tx, workoutId)),
    // Metadata only: never `workouts`, so Workout ids stay.
    updatePlan: (planId, changes) =>
      weighed((tx) => updatePlan(tx, userId, planId, changes)),
    updateProfile: (changes) =>
      asUser(userId, (tx) => updateProfile(tx, userId, changes)),
  };
};
