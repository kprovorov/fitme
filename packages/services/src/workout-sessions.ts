import {
  exercises,
  plans,
  type Transaction,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import {
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * A timestamp as PostgREST rendered it (`2026-10-01T10:00:00.123456+00:00`),
 * so outputs don't change shape: `pg` would return `2026-10-01 10:00:00+00`.
 */
const timestampText = <T extends string | null = string>(column: AnyPgColumn) =>
  sql<T>`to_json(${column}) #>> '{}'`;

/** numeric columns arrive as strings; PostgREST returned numbers. */
const toNumber = (value: string | null) =>
  value === null ? null : Number(value);

export type WorkoutSessionStatus = "finished" | "in_progress";

const statusOf = (finishedAt: string | null): WorkoutSessionStatus =>
  finishedAt ? "finished" : "in_progress";

interface NamedRef {
  id: string;
  name: string;
}

/** A Plan reference whose name may be unset. */
interface PlanRef {
  id: string;
  name: string | null;
}

/** One set of a Workout Session; weights are in the User's unit. */
export interface WorkoutSessionSet {
  id: string;
  logged_at: string | null;
  order: number;
  reps_completed: number | null;
  reps_recommended: number | null;
  rest_recommended: number | null;
  weight_completed: number | null;
  weight_recommended: number | null;
}

export interface WorkoutSessionExercise {
  exercise: NamedRef;
  id: string;
  order: number;
  sets: WorkoutSessionSet[];
}

/** A Workout Session with its exercises and sets, each in order. */
export interface WorkoutSessionDetail {
  exercises: WorkoutSessionExercise[];
  finished_at: string | null;
  id: string;
  plan: PlanRef | null;
  started_at: string;
  status: WorkoutSessionStatus;
  workout: NamedRef | null;
}

export interface WorkoutSessionSummary {
  exercise_count: number;
  finished_at: string | null;
  id: string;
  logged_set_count: number;
  plan: PlanRef | null;
  set_count: number;
  started_at: string;
  status: WorkoutSessionStatus;
  workout: NamedRef | null;
}

export type WorkoutSessionStatusFilter = "all" | WorkoutSessionStatus;

export interface ListWorkoutSessionsOptions {
  limit: number;
  offset: number;
  status: WorkoutSessionStatusFilter;
}

export interface WorkoutSessionPage {
  sessions: WorkoutSessionSummary[];
  total: number;
}

interface JoinedRefs {
  planId: string | null;
  planName: string | null;
  workoutId: string | null;
  workoutName: string | null;
}

/**
 * The left-joined Workout and Plan, or `null` where the join found none. A
 * Plan's name may be unset; a Workout's never is, so a null one means no match.
 */
const refsOf = ({ planId, planName, workoutId, workoutName }: JoinedRefs) => ({
  plan: planId === null ? null : { id: planId, name: planName },
  workout:
    workoutId === null || workoutName === null
      ? null
      : { id: workoutId, name: workoutName },
});

const sessionColumns = {
  finishedAt: timestampText<string | null>(workoutSessions.finishedAt),
  id: workoutSessions.id,
  planId: plans.id,
  planName: plans.name,
  startedAt: timestampText(workoutSessions.startedAt),
  workoutId: workouts.id,
  workoutName: workouts.name,
};

const setColumns = {
  id: workoutSessionExerciseSets.id,
  loggedAt: timestampText<string | null>(workoutSessionExerciseSets.loggedAt),
  order: workoutSessionExerciseSets.order,
  repsCompleted: workoutSessionExerciseSets.repsCompleted,
  repsRecommended: workoutSessionExerciseSets.repsRecommended,
  restRecommended: workoutSessionExerciseSets.restRecommended,
  weightCompleted: workoutSessionExerciseSets.weightCompleted,
  weightRecommended: workoutSessionExerciseSets.weightRecommended,
};

interface SetRow {
  id: string;
  loggedAt: string | null;
  order: number;
  repsCompleted: number | null;
  repsRecommended: number | null;
  restRecommended: number | null;
  weightCompleted: string | null;
  weightRecommended: string | null;
}

const toSet = (row: SetRow): WorkoutSessionSet => ({
  id: row.id,
  logged_at: row.loggedAt,
  order: row.order,
  reps_completed: row.repsCompleted,
  reps_recommended: row.repsRecommended,
  rest_recommended: row.restRecommended,
  weight_completed: toNumber(row.weightCompleted),
  weight_recommended: toNumber(row.weightRecommended),
});

const statusCondition = (status: WorkoutSessionStatusFilter) => {
  if (status === "in_progress") {
    return isNull(workoutSessions.finishedAt);
  }
  if (status === "finished") {
    return isNotNull(workoutSessions.finishedAt);
  }
};

const countOf = (subquery: SQL) =>
  sql<number>`(${subquery})::int`.mapWith(Number);

/**
 * The User's Workout Sessions, newest first, with their Workout and Plan and
 * how many sets were logged, in `tx` (from `asUser`; RLS hides every other
 * User's). An offset past the end is an empty page.
 */
export const listWorkoutSessions = async (
  tx: Transaction,
  { limit, offset, status }: ListWorkoutSessionsOptions
): Promise<WorkoutSessionPage> => {
  const where = statusCondition(status);
  const sessionExerciseIds = sql`select ${workoutSessionExercises.id} from ${workoutSessionExercises} where ${workoutSessionExercises.workoutSessionId} = ${workoutSessions.id}`;
  const rows = await tx
    .select({
      ...sessionColumns,
      exerciseCount: countOf(
        sql`select count(*) from ${workoutSessionExercises} where ${workoutSessionExercises.workoutSessionId} = ${workoutSessions.id}`
      ),
      loggedSetCount: countOf(
        sql`select count(*) from ${workoutSessionExerciseSets} where ${workoutSessionExerciseSets.workoutSessionExerciseId} in (${sessionExerciseIds}) and ${workoutSessionExerciseSets.loggedAt} is not null`
      ),
      setCount: countOf(
        sql`select count(*) from ${workoutSessionExerciseSets} where ${workoutSessionExerciseSets.workoutSessionExerciseId} in (${sessionExerciseIds})`
      ),
    })
    .from(workoutSessions)
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .where(where)
    .orderBy(desc(workoutSessions.startedAt), asc(workoutSessions.id))
    .limit(limit)
    .offset(offset);
  const [{ total }] = await tx
    .select({ total: count() })
    .from(workoutSessions)
    .where(where);

  return {
    sessions: rows.map((row) => ({
      exercise_count: row.exerciseCount,
      finished_at: row.finishedAt,
      id: row.id,
      logged_set_count: row.loggedSetCount,
      set_count: row.setCount,
      started_at: row.startedAt,
      status: statusOf(row.finishedAt),
      ...refsOf(row),
    })),
    total,
  };
};

/**
 * One of the User's Workout Sessions with its Workout and Plan, and its
 * exercises and their sets in order, in `tx` (from `asUser`), or `null` when
 * there is none with that id the User can see.
 */
export const getWorkoutSession = async (
  tx: Transaction,
  sessionId: string
): Promise<WorkoutSessionDetail | null> => {
  const [session] = await tx
    .select(sessionColumns)
    .from(workoutSessions)
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .where(eq(workoutSessions.id, sessionId));
  if (!session) {
    return null;
  }

  const sessionExercises = await tx
    .select({
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      id: workoutSessionExercises.id,
      order: workoutSessionExercises.order,
    })
    .from(workoutSessionExercises)
    .innerJoin(exercises, eq(exercises.id, workoutSessionExercises.exerciseId))
    .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
    .orderBy(
      asc(workoutSessionExercises.order),
      asc(workoutSessionExercises.id)
    );
  const sets = await tx
    .select({
      ...setColumns,
      sessionExerciseId: workoutSessionExerciseSets.workoutSessionExerciseId,
    })
    .from(workoutSessionExerciseSets)
    .innerJoin(
      workoutSessionExercises,
      eq(
        workoutSessionExercises.id,
        workoutSessionExerciseSets.workoutSessionExerciseId
      )
    )
    .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
    .orderBy(
      asc(workoutSessionExerciseSets.order),
      asc(workoutSessionExerciseSets.id)
    );

  return {
    exercises: sessionExercises.map((exercise) => ({
      exercise: { id: exercise.exerciseId, name: exercise.exerciseName },
      id: exercise.id,
      order: exercise.order,
      sets: sets
        .filter((set) => set.sessionExerciseId === exercise.id)
        .map(toSet),
    })),
    finished_at: session.finishedAt,
    id: session.id,
    started_at: session.startedAt,
    status: statusOf(session.finishedAt),
    ...refsOf(session),
  };
};

export interface LogSetInput {
  repsCompleted: number;
  setId: string;
  /** In the User's unit (kg or lbs), stored as given. */
  weightCompleted: number;
}

export type LogSetResult =
  | { set: WorkoutSessionSet; status: "logged" }
  | { finishedAt: string; sessionId: string; status: "session_finished" }
  | { status: "not_found" };

/**
 * Records reps, weight and `logged_at` (now) on one set of the User's open
 * Workout Session, in `tx` (from `asUser`), overwriting an earlier log. A set
 * the User can't see is `not_found`; a set of a finished Workout Session is
 * left as it was. The session row is share-locked so it can't be finished
 * between the check and the write.
 */
export const logSet = async (
  tx: Transaction,
  { repsCompleted, setId, weightCompleted }: LogSetInput
): Promise<LogSetResult> => {
  const [owner] = await tx
    .select({
      finishedAt: timestampText<string | null>(workoutSessions.finishedAt),
      sessionId: workoutSessions.id,
    })
    .from(workoutSessionExerciseSets)
    .innerJoin(
      workoutSessionExercises,
      eq(
        workoutSessionExercises.id,
        workoutSessionExerciseSets.workoutSessionExerciseId
      )
    )
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(eq(workoutSessionExerciseSets.id, setId))
    .for("share", { of: workoutSessions });
  if (!owner) {
    return { status: "not_found" };
  }
  if (owner.finishedAt) {
    return {
      finishedAt: owner.finishedAt,
      sessionId: owner.sessionId,
      status: "session_finished",
    };
  }

  const [set] = await tx
    .update(workoutSessionExerciseSets)
    .set({
      loggedAt: sql`now()`,
      repsCompleted,
      weightCompleted: String(weightCompleted),
    })
    // set rows carry no user id; RLS scopes the update to the User
    .where(eq(workoutSessionExerciseSets.id, setId))
    .returning(setColumns);
  return set ? { set: toSet(set), status: "logged" } : { status: "not_found" };
};

/**
 * Deletes one of the User's Workout Sessions and, by cascade, its exercises
 * and sets, in `tx` (from `asUser`). False when there was none to delete.
 */
export const deleteWorkoutSession = async (
  tx: Transaction,
  sessionId: string
): Promise<boolean> => {
  const deleted = await tx
    .delete(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .returning({ id: workoutSessions.id });
  return deleted.length > 0;
};
