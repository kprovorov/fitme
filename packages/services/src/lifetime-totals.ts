import {
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessionProgress,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { sql } from "drizzle-orm";

import { lockProfileUnits } from "./profile";
import type { ProfileUnits } from "./profile";

/**
 * A User's Lifetime totals (GLOSSARY.md): what their qualifying Workout
 * Sessions add up to, the same sessions `@fitme/core`'s
 * `qualifiesForProgress` / `monthlyTotals` count for History's month
 * overview and the Weekly goal.
 */
export interface LifetimeTotals {
  /** `finished_at − started_at` summed over them, in whole seconds. */
  duration_seconds: number;
  /**
   * Weight × reps over their logged sets, in `weight_unit`; a set without a
   * weight adds nothing.
   */
  volume: number;
  /** `kg` without a Profile. */
  weight_unit: ProfileUnits["weight"];
  /** Finished Workout Sessions with at least one set with positive reps. */
  workout_count: number;
}

/**
 * The User's Lifetime totals, in `tx` (from `asUser`). The Profile row is
 * share-locked first (`lockProfileUnits`), so a measurement system switch
 * can't commit between reading the unit and summing the weights. One
 * statement, so the count, the time and the volume come from one snapshot.
 * Zeros for a User with no qualifying Workout Session.
 */
export const getLifetimeTotals = async (
  tx: Transaction,
  userId: string
): Promise<LifetimeTotals> => {
  const units = await lockProfileUnits(tx, userId);

  // The Weekly goal's own source (migration 20261101100000): the triggers keep
  // `completed_set_count` at the session's sets with positive reps, so both
  // read one copy of the rule, through its partial index.
  const qualifying = sql`
    select ${workoutSessionProgress.workoutSessionId} as id, ${workoutSessionProgress.startedAt} as started_at, ${workoutSessionProgress.finishedAt} as finished_at
    from ${workoutSessionProgress}
    where ${workoutSessionProgress.userId} = ${userId}
      and ${workoutSessionProgress.finishedAt} is not null
      and ${workoutSessionProgress.completedSetCount} > 0`;

  const {
    rows: [row],
  } = await tx.execute<{
    duration_seconds: number;
    volume: number;
    workout_count: number;
  }>(sql`
    with qualifying as (${qualifying})
    select
      (select count(*) from qualifying)::int as workout_count,
      (select coalesce(round(sum(greatest(extract(epoch from finished_at - started_at), 0))), 0) from qualifying)::float8 as duration_seconds,
      (
        select coalesce(round(sum(coalesce(${workoutSessionExerciseSets.weightCompleted}, 0) * ${workoutSessionExerciseSets.repsCompleted}), 2), 0)
        from ${workoutSessionExerciseSets}
        join ${workoutSessionExercises}
          on ${workoutSessionExercises.id} = ${workoutSessionExerciseSets.workoutSessionExerciseId}
        where ${workoutSessionExercises.workoutSessionId} in (select id from qualifying)
      )::float8 as volume
  `);

  return {
    duration_seconds: Number(row.duration_seconds),
    volume: Number(row.volume),
    weight_unit: units?.weight ?? "kg",
    workout_count: Number(row.workout_count),
  };
};
