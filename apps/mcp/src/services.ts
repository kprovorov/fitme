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
  activatePlan,
  createPlan,
  type DeletedPlan,
  deletePlan,
  getPlan,
  listPlans,
  type NewPlan,
  type PlanChanges,
  type PlanDetail,
  type PlanSummary,
  updatePlan,
} from "@fitme/services/plans";
import { getProfile, type ProfileWithUnits } from "@fitme/services/profile";
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
 * The services a User's tools call, each bound to that User and run in its
 * own `asUser` transaction (ADR 0003, ADR 0004). Tools never pass a User id:
 * it comes from the verified Clerk token the services were built for.
 */
export interface UserServices {
  activatePlan: (planId: string) => Promise<PlanSummary | null>;
  createPlan: (plan: NewPlan) => Promise<PlanDetail>;
  deletePlan: (planId: string) => Promise<DeletedPlan | null>;
  deleteWorkoutSession: (sessionId: string) => Promise<boolean>;
  finishWorkoutSession: (
    sessionId: string
  ) => Promise<FinishWorkoutSessionResult>;
  getExercise: (exerciseId: string) => Promise<Exercise | null>;
  getExerciseHistory: (
    query: ExerciseHistoryQuery
  ) => Promise<ExerciseHistoryEntry[]>;
  getPlan: (planId: string) => Promise<PlanDetail | null>;
  getProfile: () => Promise<ProfileWithUnits | null>;
  getWorkoutSession: (
    sessionId: string
  ) => Promise<WorkoutSessionDetail | null>;
  listExercises: (query: ExerciseQuery) => Promise<ExercisePage>;
  listPlans: () => Promise<PlanSummary[]>;
  listWorkoutSessions: (
    options: ListWorkoutSessionsOptions
  ) => Promise<WorkoutSessionPage>;
  logSet: (input: LogSetInput) => Promise<LogSetResult>;
  startWorkoutSession: (
    workoutId: string
  ) => Promise<StartWorkoutSessionResult>;
  updatePlan: (
    planId: string,
    changes: PlanChanges
  ) => Promise<PlanDetail | null>;
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
    activatePlan: (planId) =>
      asUser(userId, (tx) => activatePlan(tx, userId, planId)),
    createPlan: (plan) => asUser(userId, (tx) => createPlan(tx, userId, plan)),
    deletePlan: (planId) =>
      asUser(userId, (tx) => deletePlan(tx, userId, planId)),
    deleteWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => deleteWorkoutSession(tx, sessionId)),
    finishWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => finishWorkoutSession(tx, sessionId)),
    getExercise: (exerciseId) =>
      asUser(userId, (tx) => getExercise(tx, exerciseId)),
    getExerciseHistory: (query) =>
      asUser(userId, (tx) => getExerciseHistory(tx, userId, query)),
    getPlan: (planId) => asUser(userId, (tx) => getPlan(tx, userId, planId)),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => getWorkoutSession(tx, sessionId)),
    listExercises: (query) => asUser(userId, (tx) => listExercises(tx, query)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
    listWorkoutSessions: (options) =>
      asUser(userId, (tx) => listWorkoutSessions(tx, options)),
    logSet: (input) => asUser(userId, (tx) => logSet(tx, input)),
    startWorkoutSession: (workoutId) =>
      asUser(userId, (tx) => startWorkoutSession(tx, workoutId)),
    updatePlan: (planId, changes) =>
      asUser(userId, (tx) => updatePlan(tx, userId, planId, changes)),
  };
};
