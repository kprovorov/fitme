import {
  plans,
  type Transaction,
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
  exists,
  isNotNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { jsonTimestamp } from "./json-timestamp";

export interface ExerciseHistorySet {
  id: string;
  logged_at: string | null;
  order: number;
  reps_completed: number | null;
  reps_recommended: number | null;
  /** `null` for a bodyweight set, which logs no weight. */
  weight_completed: number | null;
  weight_recommended: number | null;
}

/** One time the Exercise appeared in one of the User's Workout Sessions. */
export interface ExerciseHistoryEntry {
  finished_at: string | null;
  plan: { id: string; name: string | null } | null;
  session_exercise_id: string;
  session_id: string;
  /** Only sets with logged reps, by `order`. */
  sets: ExerciseHistorySet[];
  started_at: string | null;
  workout: { id: string; name: string } | null;
}

export interface ExerciseHistoryQuery {
  /** The Exercise, by its Exercise slug. */
  exerciseSlug: string;
  /** Maximum number of entries. */
  limit: number;
  /** How many entries to skip. */
  offset: number;
}

export interface ExerciseHistoryPage {
  entries: ExerciseHistoryEntry[];
  /** How many entries match, across every page. */
  total: number;
}

/**
 * A set counts once its reps are logged. A bodyweight set logs no weight, so
 * the weight says nothing about whether it was done.
 */
const isLogged = isNotNull(workoutSessionExerciseSets.repsCompleted);

/** numeric columns arrive as strings; PostgREST returned numbers */
const asNumber = (value: string | null) =>
  value === null ? null : Number(value);

const countEntries = async (tx: Transaction, where: SQL | undefined) => {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(where);
  return total;
};

/**
 * A page of the User's logged sets for one Exercise, newest Workout Session
 * first, in `tx` (from `asUser`). A set counts once its reps are logged, a
 * bodyweight set (no weight) included; an entry with no counted set is left
 * out, of the page and of `total` alike. Only the User's own Workout Sessions
 * count; RLS hides everyone else's too. An unknown slug, and an offset past
 * the end, answer an empty page.
 */
export const getExerciseHistory = async (
  tx: Transaction,
  userId: string,
  { exerciseSlug, limit, offset }: ExerciseHistoryQuery
): Promise<ExerciseHistoryPage> => {
  const matches = and(
    eq(workoutSessionExercises.exerciseSlug, exerciseSlug),
    eq(workoutSessions.userId, userId),
    exists(
      tx
        .select({ one: sql`1` })
        .from(workoutSessionExerciseSets)
        .where(
          and(
            eq(
              workoutSessionExerciseSets.workoutSessionExerciseId,
              workoutSessionExercises.id
            ),
            isLogged
          )
        )
    )
  );
  // Newest Workout Session first; an Exercise added to one session twice
  // keeps its place in it.
  const newest = [
    desc(workoutSessions.startedAt),
    desc(workoutSessions.id),
    asc(workoutSessionExercises.order),
    asc(workoutSessionExercises.id),
  ] as const;
  const page = tx
    .select({
      id: workoutSessionExercises.id,
      // counted in the page's own statement, so it matches the rows
      total: sql<number>`(count(*) over ())::int`.mapWith(Number).as("total"),
    })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(matches)
    .orderBy(...newest)
    .limit(limit)
    .offset(offset)
    .as("page");

  const rows = await tx
    .select({
      entry: {
        finished_at: jsonTimestamp(workoutSessions.finishedAt),
        session_exercise_id: workoutSessionExercises.id,
        session_id: workoutSessions.id,
        started_at: jsonTimestamp(workoutSessions.startedAt),
      },
      plan: { id: plans.id, name: plans.name },
      set: {
        id: workoutSessionExerciseSets.id,
        logged_at: jsonTimestamp(workoutSessionExerciseSets.loggedAt),
        order: workoutSessionExerciseSets.order,
        reps_completed: workoutSessionExerciseSets.repsCompleted,
        reps_recommended: workoutSessionExerciseSets.repsRecommended,
        weight_completed: workoutSessionExerciseSets.weightCompleted,
        weight_recommended: workoutSessionExerciseSets.weightRecommended,
      },
      total: page.total,
      workout: { id: workouts.id, name: workouts.name },
    })
    .from(workoutSessionExercises)
    .innerJoin(page, eq(page.id, workoutSessionExercises.id))
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .innerJoin(
      workoutSessionExerciseSets,
      and(
        eq(
          workoutSessionExerciseSets.workoutSessionExerciseId,
          workoutSessionExercises.id
        ),
        isLogged
      )
    )
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .orderBy(
      ...newest,
      asc(workoutSessionExerciseSets.order),
      asc(workoutSessionExerciseSets.id)
    );

  const entries = new Map<string, ExerciseHistoryEntry>();
  for (const { entry, plan, set, workout } of rows) {
    const current = entries.get(entry.session_exercise_id) ?? {
      ...entry,
      plan,
      sets: [],
      workout,
    };
    current.sets.push({
      ...set,
      weight_completed: asNumber(set.weight_completed),
      weight_recommended: asNumber(set.weight_recommended),
    });
    entries.set(entry.session_exercise_id, current);
  }
  const [first] = rows;
  return {
    entries: [...entries.values()],
    // An empty page has no row to carry the total: count on its own (no rows
    // to disagree with).
    total: first ? first.total : await countEntries(tx, matches),
  };
};
