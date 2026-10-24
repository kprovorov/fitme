import { randomUUID } from "node:crypto";
import {
  plans,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
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
  /**
   * The Exercise, by its Exercise slug: details come from the Exercise
   * Library API.
   */
  exercise_slug: string;
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

const countSessions = async (tx: Transaction, where: SQL | undefined) => {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(workoutSessions)
    .where(where);
  return total;
};

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
      // counted in the page's own statement, so it matches the rows
      total: sql<number>`(count(*) over ())::int`.mapWith(Number),
    })
    .from(workoutSessions)
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .where(where)
    .orderBy(desc(workoutSessions.startedAt), asc(workoutSessions.id))
    .limit(limit)
    .offset(offset);
  const [first] = rows;
  // An empty page has no row to carry the total: count on its own (no rows
  // to disagree with).
  const total = first ? first.total : await countSessions(tx, where);

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
 * The Workout Sessions matching `where`, in `orderBy` order, each with its
 * Workout and Plan, and its exercises and their sets in order. One statement,
 * so a concurrent delete can't leave a half-read session (READ COMMITTED gives
 * each statement its own snapshot).
 */
const findSessionDetails = async (
  tx: Transaction,
  where: SQL,
  orderBy: SQL[] = []
): Promise<WorkoutSessionDetail[]> => {
  const rows = await tx
    .select({
      ...sessionColumns,
      exerciseSlug: workoutSessionExercises.exerciseSlug,
      sessionExerciseId: workoutSessionExercises.id,
      sessionExerciseOrder: workoutSessionExercises.order,
      ...setColumns,
      id: workoutSessions.id,
      setId: workoutSessionExerciseSets.id,
      setOrder: workoutSessionExerciseSets.order,
    })
    .from(workoutSessions)
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .leftJoin(
      workoutSessionExercises,
      eq(workoutSessionExercises.workoutSessionId, workoutSessions.id)
    )
    .leftJoin(
      workoutSessionExerciseSets,
      eq(
        workoutSessionExerciseSets.workoutSessionExerciseId,
        workoutSessionExercises.id
      )
    )
    .where(where)
    .orderBy(
      ...orderBy,
      asc(workoutSessions.id),
      asc(workoutSessionExercises.order),
      asc(workoutSessionExercises.id),
      asc(workoutSessionExerciseSets.order),
      asc(workoutSessionExerciseSets.id)
    );

  const sessions = new Map<string, WorkoutSessionDetail>();
  const sessionExercises = new Map<string, WorkoutSessionExercise>();
  for (const row of rows) {
    let session = sessions.get(row.id);
    if (!session) {
      session = {
        exercises: [],
        finished_at: row.finishedAt,
        id: row.id,
        started_at: row.startedAt,
        status: statusOf(row.finishedAt),
        ...refsOf(row),
      };
      sessions.set(row.id, session);
    }
    const {
      exerciseSlug,
      sessionExerciseId,
      sessionExerciseOrder,
      setId,
      setOrder,
    } = row;
    if (
      sessionExerciseId === null ||
      sessionExerciseOrder === null ||
      exerciseSlug === null
    ) {
      continue;
    }
    let exercise = sessionExercises.get(sessionExerciseId);
    if (!exercise) {
      exercise = {
        exercise_slug: exerciseSlug,
        id: sessionExerciseId,
        order: sessionExerciseOrder,
        sets: [],
      };
      sessionExercises.set(sessionExerciseId, exercise);
      session.exercises.push(exercise);
    }
    if (setId !== null && setOrder !== null) {
      exercise.sets.push(toSet({ ...row, id: setId, order: setOrder }));
    }
  }
  return [...sessions.values()];
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
  const [session] = await findSessionDetails(
    tx,
    eq(workoutSessions.id, sessionId)
  );
  return session ?? null;
};

export interface WorkoutHistoryOptions {
  limit: number;
}

/**
 * The User's last `limit` finished Workout Sessions, last finished first, each
 * in full like `getWorkoutSession` (the reps and weights logged per set), in
 * `tx` (from `asUser`; RLS hides every other User's). One statement, so one
 * snapshot.
 */
export const listWorkoutHistory = (
  tx: Transaction,
  { limit }: WorkoutHistoryOptions
): Promise<WorkoutSessionDetail[]> => {
  const latestFinished = tx
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(isNotNull(workoutSessions.finishedAt))
    .orderBy(desc(workoutSessions.finishedAt), asc(workoutSessions.id))
    .limit(limit);
  return findSessionDetails(tx, inArray(workoutSessions.id, latestFinished), [
    desc(workoutSessions.finishedAt),
  ]);
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
 * left as it was.
 *
 * The write comes first and checks the session is open itself, so the only
 * lock it takes is the sets table's, the same one deleteUserData takes; no
 * row lock is held while waiting for it, so they can't deadlock.
 */
export const logSet = async (
  tx: Transaction,
  { repsCompleted, setId, weightCompleted }: LogSetInput
): Promise<LogSetResult> => {
  const openSessionExerciseIds = tx
    .select({ id: workoutSessionExercises.id })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(isNull(workoutSessions.finishedAt));
  const [set] = await tx
    .update(workoutSessionExerciseSets)
    .set({
      loggedAt: sql`now()`,
      repsCompleted,
      weightCompleted: String(weightCompleted),
    })
    // set rows carry no user id; RLS scopes the update to the User
    .where(
      and(
        eq(workoutSessionExerciseSets.id, setId),
        inArray(
          workoutSessionExerciseSets.workoutSessionExerciseId,
          openSessionExerciseIds
        )
      )
    )
    .returning(setColumns);
  if (set) {
    return { set: toSet(set), status: "logged" };
  }

  const [finished] = await tx
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
    .where(eq(workoutSessionExerciseSets.id, setId));
  if (finished?.finishedAt) {
    return {
      finishedAt: finished.finishedAt,
      sessionId: finished.sessionId,
      status: "session_finished",
    };
  }
  return { status: "not_found" };
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

export type StartWorkoutSessionResult =
  | { resumed: boolean; session: WorkoutSessionDetail; status: "started" }
  | { status: "not_found" };

/**
 * A lost race for the one open session per Workout is retried this often: the
 * winner's session is resumed, or, if it was finished meanwhile, a fresh one is
 * inserted. Unlike the RPC (SECURITY DEFINER, which sees every session) the
 * start can't loop until it wins: under RLS an open session owned by another
 * id is invisible and keeps winning, so after the last attempt the start is
 * `not_found`, the RPC's error for that case.
 */
const START_ATTEMPTS = 3;

const findOpenSessionId = async (tx: Transaction, workoutId: string) => {
  const [open] = await tx
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.workoutId, workoutId),
        isNull(workoutSessions.finishedAt)
      )
    );
  return open?.id ?? null;
};

/** A Postgres uuid[] literal; uuids need no quoting. */
const uuidArray = (ids: string[]) => `{${ids.join(",")}}`;

/**
 * Copies the Workout's exercises (their Exercise slugs, as the RPC does) and
 * their sets into the session.
 */
const copyWorkoutTemplate = async (
  tx: Transaction,
  workoutId: string,
  sessionId: string
) => {
  const templateExercises = await tx
    .select({
      exerciseSlug: workoutExercises.exerciseSlug,
      id: workoutExercises.id,
      order: workoutExercises.order,
    })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.order), asc(workoutExercises.id));
  if (templateExercises.length === 0) {
    return;
  }

  // Ids chosen up front, so the sets can be copied in one statement
  const copies = templateExercises.map((template) => ({
    id: randomUUID(),
    template,
  }));
  await tx.insert(workoutSessionExercises).values(
    copies.map(({ id, template }) => ({
      exerciseSlug: template.exerciseSlug,
      id,
      order: template.order,
      workoutSessionId: sessionId,
    }))
  );
  await tx.execute(sql`
    insert into ${workoutSessionExerciseSets}
      (workout_session_exercise_id, "order", reps_recommended, weight_recommended, rest_recommended)
    select copy.id, ${workoutExerciseSets.order}, ${workoutExerciseSets.repsRecommended}, ${workoutExerciseSets.weightRecommended}, ${workoutExerciseSets.restRecommended}
    from ${workoutExerciseSets}
    join unnest(
      ${uuidArray(copies.map(({ template }) => template.id))}::uuid[],
      ${uuidArray(copies.map(({ id }) => id))}::uuid[]
    ) as copy (template_id, id)
      on copy.template_id = ${workoutExerciseSets.workoutExerciseId}
  `);
};

/** The session this transaction just inserted; no one else can delete it yet. */
const readWrittenSession = async (tx: Transaction, sessionId: string) => {
  const session = await getWorkoutSession(tx, sessionId);
  if (!session) {
    throw new Error(`Workout session ${sessionId} vanished after its write.`);
  }
  return session;
};

/**
 * Resumes the User's open session for the Workout, or inserts one and copies
 * the Workout into it.
 */
const insertOrResume = async (
  tx: Transaction,
  workoutId: string,
  planId: string,
  attemptsLeft: number
): Promise<StartWorkoutSessionResult> => {
  if (attemptsLeft === 0) {
    return { status: "not_found" };
  }
  // RLS only shows the User's own open session
  const openId = await findOpenSessionId(tx, workoutId);
  if (openId) {
    const open = await getWorkoutSession(tx, openId);
    if (open) {
      return { resumed: true, session: open, status: "started" };
    }
    // Deleted between the two reads (READ COMMITTED): start a fresh one
    return insertOrResume(tx, workoutId, planId, attemptsLeft - 1);
  }

  const [created] = await tx
    .insert(workoutSessions)
    .values({
      planId,
      startedAt: sql`now()`,
      userId: sql`public.current_user_id()`,
      workoutId,
    })
    .onConflictDoNothing({
      target: workoutSessions.workoutId,
      where: isNull(workoutSessions.finishedAt),
    })
    .returning({ id: workoutSessions.id });
  if (!created) {
    // Lost a race with a concurrent start: the next attempt resumes its
    // session (copied by that start, which has committed by now)
    return insertOrResume(tx, workoutId, planId, attemptsLeft - 1);
  }
  await copyWorkoutTemplate(tx, workoutId, created.id);
  return {
    resumed: false,
    session: await readWrittenSession(tx, created.id),
    status: "started",
  };
};

/**
 * Starts a Workout Session from one of the User's Workouts, in `tx` (from
 * `asUser`), copying its exercises and sets, and returns it. If the Workout
 * already has an open session, that one is returned (`resumed`) and nothing
 * is copied: the one-open-session-per-Workout index makes concurrent starts
 * agree on one session. A Workout the User can't see, or of a soft-deleted
 * Plan, is `not_found`.
 *
 * Mirrors the `start_workout_session` RPC, which the mobile app still calls:
 * a behaviour change goes into both.
 */
export const startWorkoutSession = async (
  tx: Transaction,
  workoutId: string
): Promise<StartWorkoutSessionResult> => {
  const [workout] = await tx
    .select({ planId: workouts.planId })
    .from(workouts)
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .where(and(eq(workouts.id, workoutId), isNull(plans.deletedAt)));
  if (!workout) {
    return { status: "not_found" };
  }

  return insertOrResume(tx, workoutId, workout.planId, START_ATTEMPTS);
};

export type FinishWorkoutSessionResult =
  | {
      alreadyFinished: boolean;
      rotated: boolean;
      session: WorkoutSessionDetail;
      status: "finished";
    }
  | { status: "not_found" };

/**
 * Moves the finished Workout to the end of its Plan and renumbers the
 * Plan's Workouts from 1, keeping the others' relative order. False when the
 * Workout is gone.
 */
const rotateWorkout = async (tx: Transaction, workoutId: string) => {
  const [workout] = await tx
    .select({ planId: workouts.planId })
    .from(workouts)
    .where(eq(workouts.id, workoutId));
  if (!workout) {
    return false;
  }

  // Lock the Plan's Workouts so concurrent finishes of the same Plan
  // renumber one after another
  await tx
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.planId, workout.planId))
    .orderBy(asc(workouts.id))
    .for("update");

  await tx.execute(sql`
    with ranked as (
      select ${workouts.id} as id, row_number() over (
        order by (${workouts.id} = ${workoutId}), ${workouts.order}, ${workouts.createdAt}, ${workouts.id}
      ) as new_order
      from ${workouts}
      where ${workouts.planId} = ${workout.planId}
    )
    update ${workouts} w
    set "order" = ranked.new_order
    from ranked
    where w.id = ranked.id
      and w."order" <> ranked.new_order
  `);
  return true;
};

/**
 * Finishes one of the User's Workout Sessions, in `tx` (from `asUser`), and
 * moves its Workout to the end of its Plan (`rotated`). A session
 * whose Workout was removed (e.g. update_plan replaced the Workouts) is only
 * finished. Finishing an already finished session changes nothing
 * (`alreadyFinished`); one the User can't see is `not_found`.
 *
 * Mirrors the `finish_workout_session` RPC, which the mobile app still calls,
 * including its lock order: a behaviour change goes into both.
 */
export const finishWorkoutSession = async (
  tx: Transaction,
  sessionId: string
): Promise<FinishWorkoutSessionResult> => {
  // Take the workout_sessions write lock before any row lock: it conflicts
  // with deleteUserData's table locks, so a finish racing it waits up front
  // instead of holding a Plan row lock it needs while waiting for a table
  // lock it holds
  await tx.execute(sql`lock table ${workoutSessions} in row exclusive mode`);

  // Lock the Plan before the session, the order update_plan takes its locks
  // in (Plan, then Workouts, then sessions via ON DELETE SET NULL), so a
  // finish racing a Plan edit waits instead of deadlocking
  const [owned] = await tx
    .select({ planId: workoutSessions.planId })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (!owned) {
    return { status: "not_found" };
  }
  if (owned.planId) {
    await tx
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.id, owned.planId))
      .for("no key update");
  }

  // Claim the session: only an open one is finished, and only once
  const [claimed] = await tx
    .update(workoutSessions)
    .set({ finishedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(eq(workoutSessions.id, sessionId), isNull(workoutSessions.finishedAt))
    )
    .returning({ workoutId: workoutSessions.workoutId });

  const rotated = claimed?.workoutId
    ? await rotateWorkout(tx, claimed.workoutId)
    : false;
  // An already finished session isn't locked, so it may have been deleted
  // since the claim (READ COMMITTED)
  const session = await getWorkoutSession(tx, sessionId);
  if (!session) {
    return { status: "not_found" };
  }
  return { alreadyFinished: !claimed, rotated, session, status: "finished" };
};
