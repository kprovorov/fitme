import {
  asUser,
  plans,
  profiles,
  type Transaction,
  weeklyGoalChanges,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import {
  applyPlanUpdate,
  type PlanUpdate,
  previewPlanUpdate,
} from "@fitme/services/plan-update";
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
  replaceProfile,
  updateProfile,
  type WholeProfile,
} from "@fitme/services/profile";
import {
  listWeeklyGoalChanges,
  type WeeklyGoalChange,
} from "@fitme/services/weekly-goals";
import {
  type AddExerciseToWorkoutSessionInput,
  type AddExerciseToWorkoutSessionResult,
  type AddSetToWorkoutSessionExerciseInput,
  type AddSetToWorkoutSessionExerciseResult,
  addExerciseToWorkoutSession,
  addSetToWorkoutSessionExercise,
  deleteWorkoutSession,
  type FinishWorkoutSessionResult,
  finishWorkoutSession,
  getWorkoutSession,
  type ListWorkoutSessionsOptions,
  type LogSetInput,
  type LogSetResult,
  listWorkoutSessions,
  logSet,
  type RemoveExerciseFromWorkoutSessionResult,
  type ReplaceExerciseInWorkoutSessionInput,
  type ReplaceExerciseInWorkoutSessionResult,
  removeExerciseFromWorkoutSession,
  replaceExerciseInWorkoutSession,
  type StartWorkoutSessionResult,
  startWorkoutSession,
  type WorkoutSessionDetail,
  type WorkoutSessionPage,
} from "@fitme/services/workout-sessions";
import { sql } from "drizzle-orm";

/**
 * The User tables a write may touch, in deleteUserData's lock order (its
 * LOCKED_TABLES, without arnold_sessions): a Plan write or a finish records
 * the Weekly goal last.
 */
const USER_TABLES = sql.join(
  [
    profiles,
    plans,
    workoutSessions,
    workouts,
    workoutExercises,
    workoutExerciseSets,
    workoutSessionExercises,
    workoutSessionExerciseSets,
    weeklyGoalChanges,
  ],
  sql`, `
);

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
   * Appends an Exercise, with no sets, after the last one of the User's open
   * Workout Session; a finished one is left as it was. Its Exercise slug is
   * checked before, not here (ADR 0010).
   */
  addExerciseToWorkoutSession: (
    input: AddExerciseToWorkoutSessionInput
  ) => Promise<Weighed<AddExerciseToWorkoutSessionResult>>;
  /**
   * Appends a logged set to a Workout Session Exercise of the User's open
   * Workout Session, its weight in the User's unit; a finished one is left as
   * it was.
   */
  addSetToWorkoutSessionExercise: (
    input: AddSetToWorkoutSessionExerciseInput
  ) => Promise<Weighed<AddSetToWorkoutSessionExerciseResult>>;
  /**
   * Applies the Plan Update of one of the User's Workout Sessions in one
   * transaction and answers what it applied; once applied, no changes. `null`
   * when the User has no such Workout Session.
   */
  applyPlanUpdate: (sessionId: string) => Promise<PlanUpdate | null>;
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
  /** Every change of the User's Weekly goal, oldest first. */
  listWeeklyGoalChanges: () => Promise<WeeklyGoalChange[]>;
  /** A page of the User's Workout Sessions, their volumes in the User's unit. */
  listWorkoutSessions: (
    options: ListWorkoutSessionsOptions
  ) => Promise<Weighed<WorkoutSessionPage>>;
  /** Logs one set of the User's open Workout Session, its weight in the User's unit. */
  logSet: (input: LogSetInput) => Promise<Weighed<LogSetResult>>;
  /**
   * The Plan Update of one of the User's Workout Sessions, writing nothing;
   * `null` when the User has no such Workout Session.
   */
  previewPlanUpdate: (sessionId: string) => Promise<PlanUpdate | null>;
  /**
   * Removes an Exercise, with its sets, from the User's open Workout Session,
   * leaving the others' `order`; a finished one is left as it was.
   */
  removeExerciseFromWorkoutSession: (
    sessionExerciseId: string
  ) => Promise<RemoveExerciseFromWorkoutSessionResult>;
  /**
   * Replaces the Exercise of a Workout Session Exercise of the User's open
   * Workout Session and zeroes its sets' targets; a finished one is left as it
   * was. Its Exercise slug is checked before, not here (ADR 0010).
   */
  replaceExerciseInWorkoutSession: (
    input: ReplaceExerciseInWorkoutSessionInput
  ) => Promise<Weighed<ReplaceExerciseInWorkoutSessionResult>>;
  /**
   * Creates the Profile (`created: true`) or replaces it as `updateProfile`
   * with every field would, converting to a new measurement system first.
   */
  replaceProfile: (
    profile: WholeProfile
  ) => Promise<{ created: boolean; profile: ProfileWithUnits }>;
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
  /**
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

  /** `run`, after locking the units its weights are in (and `before`, first). */
  const inUnits = <T>(
    run: (tx: Transaction) => Promise<T>,
    { before }: { before?: (tx: Transaction) => Promise<unknown> } = {}
  ) =>
    asUser(userId, async (tx): Promise<Weighed<T>> => {
      await before?.(tx);
      const units = await lockProfileUnits(tx, userId);
      return { value: await run(tx), weightUnit: units?.weight ?? "kg" };
    });

  /**
   * Locks the tables a write touches, before the Profile row lock: an account
   * deletion holds those tables and then deletes that row, so asking for
   * them after it would deadlock. Waiting for them up front holds nothing.
   */
  const write = {
    before: (tx: Transaction) =>
      tx.execute(sql`lock table ${USER_TABLES} in row exclusive mode`),
  };

  /** `read` (or a write, with `write`) in its units, or `null` when it finds nothing. */
  const weighed = async <T>(
    read: (tx: Transaction) => Promise<T | null>,
    options?: typeof write
  ) => {
    const { value, weightUnit } = await inUnits(read, options);
    return value === null ? null : { value, weightUnit };
  };

  return {
    // Activated and read back in one transaction, so the answer is the Plan
    // this request activated.
    activatePlan: (planId) =>
      weighed(
        async (tx) =>
          (await activatePlan(tx, userId, planId))
            ? getPlan(tx, userId, planId)
            : null,
        write
      ),
    addExerciseToWorkoutSession: (input) =>
      inUnits((tx) => addExerciseToWorkoutSession(tx, userId, input), write),
    addSetToWorkoutSessionExercise: (input) =>
      inUnits((tx) => addSetToWorkoutSessionExercise(tx, userId, input), write),
    // The service takes its own table locks and reads the unit itself.
    applyPlanUpdate: (sessionId) =>
      asUser(userId, (tx) => applyPlanUpdate(tx, userId, sessionId)),
    createPlan: (plan, options) =>
      inUnits((tx) => createPlan(tx, userId, plan, options), write),
    deletePlan: (planId) =>
      asUser(userId, (tx) => deletePlan(tx, userId, planId)),
    deleteWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => deleteWorkoutSession(tx, sessionId)),
    finishWorkoutSession: (sessionId) =>
      inUnits((tx) => finishWorkoutSession(tx, sessionId), write),
    getActivePlan: () => weighed((tx) => getActivePlan(tx, userId)),
    getPlan: (planId) => weighed((tx) => getPlan(tx, userId, planId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      weighed((tx) => getWorkoutSession(tx, sessionId)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
    listWeeklyGoalChanges: () =>
      asUser(userId, (tx) => listWeeklyGoalChanges(tx, userId)),
    listWorkoutSessions: (options) =>
      inUnits((tx) => listWorkoutSessions(tx, options)),
    logSet: (input) => inUnits((tx) => logSet(tx, input), write),
    previewPlanUpdate: (sessionId) =>
      asUser(userId, (tx) => previewPlanUpdate(tx, userId, sessionId)),
    removeExerciseFromWorkoutSession: (sessionExerciseId) =>
      asUser(userId, async (tx) => {
        await write.before(tx);
        return removeExerciseFromWorkoutSession(tx, userId, sessionExerciseId);
      }),
    replaceExerciseInWorkoutSession: (input) =>
      inUnits(
        (tx) => replaceExerciseInWorkoutSession(tx, userId, input),
        write
      ),
    replaceProfile: (profile) =>
      asUser(userId, (tx) => replaceProfile(tx, userId, profile)),
    replaceWorkouts: (planId, replacement) =>
      weighed(
        (tx) => updatePlan(tx, userId, planId, { workouts: replacement }),
        write
      ),
    startWorkoutSession: (workoutId) =>
      inUnits((tx) => startWorkoutSession(tx, workoutId), write),
    // Metadata only: never `workouts`, so Workout ids stay.
    updatePlan: (planId, changes) =>
      weighed((tx) => updatePlan(tx, userId, planId, changes), write),
    updateProfile: (changes) =>
      asUser(userId, (tx) => updateProfile(tx, userId, changes)),
  };
};
