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
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import { jsonTimestamp } from "./json-timestamp";

export interface ExerciseHistorySet {
  id: string;
  logged_at: string | null;
  order: number;
  reps_completed: number | null;
  weight_completed: number;
}

/** One time the Exercise appeared in one of the User's Workout Sessions. */
export interface ExerciseHistoryEntry {
  finished_at: string | null;
  plan: { id: string; name: string | null } | null;
  session_exercise_id: string;
  session_id: string;
  /** Only sets with a logged weight, by `order`. */
  sets: ExerciseHistorySet[];
  started_at: string | null;
  workout: { id: string; name: string } | null;
}

export interface ExerciseHistoryQuery {
  /** The Exercise, by its Exercise slug. */
  exerciseSlug: string;
  /** Maximum number of entries. */
  limit: number;
}

const hasWeight = isNotNull(workoutSessionExerciseSets.weightCompleted);

/**
 * The User's logged sets for one Exercise, newest entry first, in `tx` (from
 * `asUser`). Entries without a set with a logged weight are skipped. Only the
 * User's own Workout Sessions count; RLS hides everyone else's too. One
 * statement, so entries and their sets come from one snapshot.
 */
export const getExerciseHistory = async (
  tx: Transaction,
  userId: string,
  { exerciseSlug, limit }: ExerciseHistoryQuery
): Promise<ExerciseHistoryEntry[]> => {
  const matchesExercise = eq(
    workoutSessionExercises.exerciseSlug,
    exerciseSlug
  );
  const newest = desc(workoutSessionExercises.createdAt);
  const latestEntries = tx
    .select({ id: workoutSessionExercises.id })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(
      and(
        matchesExercise,
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
                hasWeight
              )
            )
        )
      )
    )
    .orderBy(newest, desc(workoutSessionExercises.id))
    .limit(limit);

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
        weight_completed: workoutSessionExerciseSets.weightCompleted,
      },
      workout: { id: workouts.id, name: workouts.name },
    })
    .from(workoutSessionExercises)
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
        hasWeight
      )
    )
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .where(inArray(workoutSessionExercises.id, latestEntries))
    .orderBy(
      newest,
      desc(workoutSessionExercises.id),
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
    // numeric columns arrive as strings; PostgREST returned numbers
    current.sets.push({
      ...set,
      weight_completed: Number(set.weight_completed),
    });
    entries.set(entry.session_exercise_id, current);
  }
  return [...entries.values()];
};
