import { asUser } from "@fitme/db";
import type { Transaction } from "@fitme/db";
import {
  listExerciseNotes,
  setExerciseNote,
} from "@fitme/services/exercise-notes";
import type {
  ExerciseNote,
  SetExerciseNoteInput,
  SetExerciseNoteResult,
} from "@fitme/services/exercise-notes";
import { getExerciseHistory } from "@fitme/services/exercises";
import type {
  ExerciseHistoryPage,
  ExerciseHistoryQuery,
} from "@fitme/services/exercises";
import {
  activatePlan,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  updatePlan,
} from "@fitme/services/plans";
import type {
  DeletedPlan,
  NewPlan,
  PlanChanges,
  PlanDetail,
  PlanSummary,
} from "@fitme/services/plans";
import { getProfile } from "@fitme/services/profile";
import type { ProfileWithUnits } from "@fitme/services/profile";
import {
  deleteWorkoutSession,
  finishWorkoutSession,
  getWorkoutSession,
  listWorkoutSessions,
  logSet,
  removeSetFromWorkoutSession,
  setWorkoutSessionSetNote,
  startWorkoutSession,
} from "@fitme/services/workout-sessions";
import type {
  FinishWorkoutSessionResult,
  ListWorkoutSessionsOptions,
  LogSetInput,
  LogSetResult,
  RemoveSetFromWorkoutSessionResult,
  SetWorkoutSessionSetNoteInput,
  SetWorkoutSessionSetNoteResult,
  StartWorkoutSessionResult,
  WorkoutSessionDetail,
  WorkoutSessionPage,
} from "@fitme/services/workout-sessions";

/**
 * A read (or a write's answer) together with the User's Exercise notes, read
 * in the same transaction (one read of them, however many Exercises it
 * shows), for a tool that shows each Exercise with its note. `exerciseNotes`
 * is empty when there's nothing to show them with.
 */
export interface Noted<T> {
  exerciseNotes: ExerciseNote[];
  value: T;
}

/**
 * The services a User's tools call, each bound to that User and run in its
 * own `asUser` transaction (ADR 0003, ADR 0004). Tools never pass a User id:
 * it comes from the verified Clerk token the services were built for.
 */
export interface UserServices {
  activatePlan: (planId: string) => Promise<PlanSummary | null>;
  createPlan: (plan: NewPlan) => Promise<Noted<PlanDetail>>;
  deletePlan: (planId: string) => Promise<DeletedPlan | null>;
  deleteWorkoutSession: (sessionId: string) => Promise<boolean>;
  finishWorkoutSession: (
    sessionId: string
  ) => Promise<Noted<FinishWorkoutSessionResult>>;
  getExerciseHistory: (
    query: ExerciseHistoryQuery
  ) => Promise<Noted<ExerciseHistoryPage>>;
  getPlan: (planId: string) => Promise<Noted<PlanDetail | null>>;
  getProfile: () => Promise<ProfileWithUnits | null>;
  getWorkoutSession: (
    sessionId: string
  ) => Promise<Noted<WorkoutSessionDetail | null>>;
  listExerciseNotes: () => Promise<ExerciseNote[]>;
  listPlans: () => Promise<PlanSummary[]>;
  listWorkoutSessions: (
    options: ListWorkoutSessionsOptions
  ) => Promise<WorkoutSessionPage>;
  logSet: (input: LogSetInput) => Promise<LogSetResult>;
  removeSetFromWorkoutSession: (
    setId: string
  ) => Promise<RemoveSetFromWorkoutSessionResult>;
  setExerciseNote: (
    input: SetExerciseNoteInput
  ) => Promise<SetExerciseNoteResult>;
  setWorkoutSessionSetNote: (
    input: SetWorkoutSessionSetNoteInput
  ) => Promise<SetWorkoutSessionSetNoteResult>;
  startWorkoutSession: (
    workoutId: string
  ) => Promise<Noted<StartWorkoutSessionResult>>;
  updatePlan: (
    planId: string,
    changes: PlanChanges
  ) => Promise<Noted<PlanDetail | null>>;
}

/**
 * Builds the services for a verified User id, or returns `null` when the
 * server isn't configured for the database.
 */
export type ServicesFactory = (userId: string) => UserServices | null;

/**
 * Runs `read` and then, in the same transaction, reads the User's Exercise
 * notes when `shows` says the answer has Exercises to show them with. The
 * notes are read last: a plain read of `exercise_notes` takes no lock an
 * account deletion waits on, so it can follow the write's own locks.
 */
const noted = async <T>(
  tx: Transaction,
  userId: string,
  value: T,
  shows: (value: T) => boolean
): Promise<Noted<T>> => ({
  exerciseNotes: shows(value) ? await listExerciseNotes(tx, userId) : [],
  value,
});

const present = (value: unknown) => value !== null;

const started = (result: { status: string }) =>
  result.status === "started" || result.status === "finished";

/** Services on the `fitme` login through the pooler (`FITME_DATABASE_URL`). */
export const createServicesFromEnv: ServicesFactory = (userId) => {
  if (!process.env.FITME_DATABASE_URL) {
    return null;
  }

  return {
    activatePlan: (planId) =>
      asUser(userId, (tx) => activatePlan(tx, userId, planId)),
    createPlan: (plan) =>
      asUser(
        userId,
        async (tx) =>
          await noted(tx, userId, await createPlan(tx, userId, plan), present)
      ),
    deletePlan: (planId) =>
      asUser(userId, (tx) => deletePlan(tx, userId, planId)),
    deleteWorkoutSession: (sessionId) =>
      asUser(userId, (tx) => deleteWorkoutSession(tx, sessionId)),
    finishWorkoutSession: (sessionId) =>
      asUser(
        userId,
        async (tx) =>
          await noted(
            tx,
            userId,
            await finishWorkoutSession(tx, sessionId),
            started
          )
      ),
    getExerciseHistory: (query) =>
      asUser(
        userId,
        async (tx) =>
          await noted(
            tx,
            userId,
            await getExerciseHistory(tx, userId, query),
            present
          )
      ),
    getPlan: (planId) =>
      asUser(
        userId,
        async (tx) =>
          await noted(tx, userId, await getPlan(tx, userId, planId), present)
      ),
    getProfile: () => asUser(userId, (tx) => getProfile(tx, userId)),
    getWorkoutSession: (sessionId) =>
      asUser(
        userId,
        async (tx) =>
          await noted(
            tx,
            userId,
            await getWorkoutSession(tx, sessionId),
            present
          )
      ),
    listExerciseNotes: () =>
      asUser(userId, (tx) => listExerciseNotes(tx, userId)),
    listPlans: () => asUser(userId, (tx) => listPlans(tx, userId)),
    listWorkoutSessions: (options) =>
      asUser(userId, (tx) => listWorkoutSessions(tx, options)),
    logSet: (input) => asUser(userId, (tx) => logSet(tx, input)),
    removeSetFromWorkoutSession: (setId) =>
      asUser(userId, (tx) => removeSetFromWorkoutSession(tx, userId, setId)),
    setExerciseNote: (input) =>
      asUser(userId, (tx) => setExerciseNote(tx, userId, input)),
    setWorkoutSessionSetNote: (input) =>
      asUser(userId, (tx) => setWorkoutSessionSetNote(tx, userId, input)),
    startWorkoutSession: (workoutId) =>
      asUser(
        userId,
        async (tx) =>
          await noted(
            tx,
            userId,
            await startWorkoutSession(tx, workoutId),
            started
          )
      ),
    updatePlan: (planId, changes) =>
      asUser(
        userId,
        async (tx) =>
          await noted(
            tx,
            userId,
            await updatePlan(tx, userId, planId, changes),
            present
          )
      ),
  };
};
