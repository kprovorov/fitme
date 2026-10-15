import {
  exercises,
  plans,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { and, count, eq, inArray, max, type SQL, sql } from "drizzle-orm";
import {
  type PlanSet,
  type PlanSetInput,
  UnknownExercisesError,
} from "./plans";

/**
 * The Coach's edits to one Workout of a Plan. Each runs in `tx` from `asUser`,
 * so it commits fully or not at all, and filters on the User id as well as
 * RLS: another User's rows are `null` (not found), never edited. A Workout of
 * a soft-deleted Plan is still edited, as the `ai-agent` tools did (RLS
 * doesn't look at `deleted_at`).
 *
 * Every edit first row-locks the parent whose children it renumbers or
 * appends to (the Workout for its Exercises, the Workout Exercise for its
 * sets), so concurrent edits of the same parent queue up and `order` stays
 * contiguous from 1. `FOR NO KEY UPDATE` still lets other transactions insert
 * rows referencing the parent, and no edit locks anything above it, so they
 * can't deadlock with `updatePlan` or `finishWorkoutSession`, which lock the
 * Plan first.
 *
 * A durable Coach step can re-run after its tool committed. Removing,
 * replacing and updating are safe to repeat; the two appends take a
 * `requestKey`, stored on the row they add, and a repeated call with the same
 * key returns that row instead of adding another.
 */

/** Locks one of the User's Workouts; its id, or `undefined`. */
const lockWorkout = async (
  tx: Transaction,
  userId: string,
  workoutId: string
) => {
  const [row] = await tx
    .select({ id: workouts.id })
    .from(workouts)
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .where(and(eq(workouts.id, workoutId), eq(plans.userId, userId)))
    .for("no key update", { of: workouts });
  return row?.id;
};

/**
 * Locks the Workout of one of the User's Workout Exercises; the Workout's id,
 * or `undefined`.
 */
const lockWorkoutOf = async (
  tx: Transaction,
  userId: string,
  workoutExerciseId: string
) => {
  const [row] = await tx
    .select({ id: workouts.id })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .where(
      and(eq(workoutExercises.id, workoutExerciseId), eq(plans.userId, userId))
    )
    .for("no key update", { of: workouts });
  return row?.id;
};

/** Locks one of the User's Workout Exercises; its id, or `undefined`. */
const lockWorkoutExercise = async (
  tx: Transaction,
  userId: string,
  workoutExerciseId: string
) => {
  const [row] = await tx
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .where(
      and(eq(workoutExercises.id, workoutExerciseId), eq(plans.userId, userId))
    )
    .for("no key update", { of: workoutExercises });
  return row?.id;
};

export interface AddedSet {
  id: string;
  order: number;
}

/**
 * Appends a set after the last set of one of the User's Workout Exercises.
 * Returns the set, or `null` without changing anything when the User has no
 * such Workout Exercise.
 */
export const addSetToExercise = async (
  tx: Transaction,
  userId: string,
  {
    requestKey,
    set,
    workoutExerciseId,
  }: { requestKey?: string; set: PlanSetInput; workoutExerciseId: string }
): Promise<AddedSet | null> => {
  if (!(await lockWorkoutExercise(tx, userId, workoutExerciseId))) {
    return null;
  }
  const inExercise = eq(
    workoutExerciseSets.workoutExerciseId,
    workoutExerciseId
  );
  if (requestKey) {
    const [repeated] = await tx
      .select({ id: workoutExerciseSets.id, order: workoutExerciseSets.order })
      .from(workoutExerciseSets)
      .where(and(inExercise, eq(workoutExerciseSets.requestKey, requestKey)));
    if (repeated) {
      return repeated;
    }
  }
  const [{ last }] = await tx
    .select({ last: max(workoutExerciseSets.order) })
    .from(workoutExerciseSets)
    .where(inExercise);
  const [added] = await tx
    .insert(workoutExerciseSets)
    .values({
      order: (last ?? 0) + 1,
      repsRecommended: set.reps_recommended,
      requestKey,
      restRecommended: set.rest_recommended,
      weightRecommended: String(set.weight_recommended),
      workoutExerciseId,
    })
    .returning({
      id: workoutExerciseSets.id,
      order: workoutExerciseSets.order,
    });
  return added;
};

/**
 * Throws `UnknownExercisesError` when the library has no such Exercise, which
 * the insert would otherwise abort on with an opaque foreign-key violation.
 */
const assertExerciseExists = async (tx: Transaction, exerciseId: string) => {
  const [known] = await tx
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  if (!known) {
    throw new UnknownExercisesError([exerciseId]);
  }
};

/** Inserts sets for a Workout Exercise, `order` from their position. */
const insertSets = async (
  tx: Transaction,
  workoutExerciseId: string,
  sets: PlanSetInput[]
) => {
  if (sets.length === 0) {
    return;
  }
  await tx.insert(workoutExerciseSets).values(
    sets.map((set, index) => ({
      order: index + 1,
      repsRecommended: set.reps_recommended,
      restRecommended: set.rest_recommended,
      weightRecommended: String(set.weight_recommended),
      workoutExerciseId,
    }))
  );
};

export interface AddedExercise {
  /** The Workout Exercise (workout_exercises.id). */
  id: string;
  order: number;
  setsAdded: number;
}

/**
 * Appends a library Exercise after the last Exercise of one of the User's
 * Workouts, with its sets in array order. Returns the new Workout Exercise, or
 * `null` without changing anything when the User has no such Workout. Throws
 * `UnknownExercisesError`, before writing anything, for an unknown Exercise.
 */
export const addExerciseToWorkout = async (
  tx: Transaction,
  userId: string,
  {
    exerciseId,
    requestKey,
    sets,
    workoutId,
  }: {
    exerciseId: string;
    requestKey?: string;
    sets: PlanSetInput[];
    workoutId: string;
  }
): Promise<AddedExercise | null> => {
  if (!(await lockWorkout(tx, userId, workoutId))) {
    return null;
  }
  const inWorkout = eq(workoutExercises.workoutId, workoutId);
  if (requestKey) {
    const [repeated] = await tx
      .select({
        id: workoutExercises.id,
        order: workoutExercises.order,
        setsAdded: count(workoutExerciseSets.id),
      })
      .from(workoutExercises)
      .leftJoin(
        workoutExerciseSets,
        eq(workoutExerciseSets.workoutExerciseId, workoutExercises.id)
      )
      .where(and(inWorkout, eq(workoutExercises.requestKey, requestKey)))
      .groupBy(workoutExercises.id);
    if (repeated) {
      return repeated;
    }
  }
  await assertExerciseExists(tx, exerciseId);
  const [{ last }] = await tx
    .select({ last: max(workoutExercises.order) })
    .from(workoutExercises)
    .where(inWorkout);
  const [added] = await tx
    .insert(workoutExercises)
    .values({ exerciseId, order: (last ?? 0) + 1, requestKey, workoutId })
    .returning({ id: workoutExercises.id, order: workoutExercises.order });
  await insertSets(tx, added.id, sets);
  return { ...added, setsAdded: sets.length };
};

/**
 * Renumbers a parent's children contiguously from 1, keeping their order (ties
 * broken by id, as the reads do).
 */
const renumber = (
  tx: Transaction,
  table: typeof workoutExercises | typeof workoutExerciseSets,
  parent: SQL
) =>
  tx.execute(sql`
    update ${table} as t set "order" = r.position
    from (
      select id, row_number() over (order by "order", id) as position
      from ${table} where ${parent}
    ) as r
    where t.id = r.id and t."order" <> r.position
  `);

/**
 * Removes one of the User's Workout Exercises with its sets, then renumbers
 * the Workout's remaining Exercises from 1. Returns `false`, changing nothing,
 * when the User has no such Workout Exercise (already removed, or never
 * theirs).
 */
export const removeExerciseFromWorkout = async (
  tx: Transaction,
  userId: string,
  workoutExerciseId: string
): Promise<boolean> => {
  const workoutId = await lockWorkoutOf(tx, userId, workoutExerciseId);
  if (!workoutId) {
    return false;
  }
  // Its sets go with it (ON DELETE CASCADE)
  const removed = await tx
    .delete(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId))
    .returning({ id: workoutExercises.id });
  if (removed.length === 0) {
    return false;
  }
  await renumber(
    tx,
    workoutExercises,
    eq(workoutExercises.workoutId, workoutId)
  );
  return true;
};

/**
 * Swaps the library Exercise of one of the User's Workout Exercises, keeping
 * its id and place in the Workout, and replaces all its sets with `sets`, in
 * array order. Returns `false`, changing nothing, when the User has no such
 * Workout Exercise. Throws `UnknownExercisesError`, before writing anything,
 * for an unknown Exercise.
 */
export const replaceExerciseInWorkout = async (
  tx: Transaction,
  userId: string,
  {
    newExerciseId,
    sets,
    workoutExerciseId,
  }: { newExerciseId: string; sets: PlanSetInput[]; workoutExerciseId: string }
): Promise<boolean> => {
  if (!(await lockWorkoutExercise(tx, userId, workoutExerciseId))) {
    return false;
  }
  await assertExerciseExists(tx, newExerciseId);
  await tx
    .update(workoutExercises)
    .set({ exerciseId: newExerciseId, updatedAt: sql`now()` })
    .where(eq(workoutExercises.id, workoutExerciseId));
  await tx
    .delete(workoutExerciseSets)
    .where(eq(workoutExerciseSets.workoutExerciseId, workoutExerciseId));
  await insertSets(tx, workoutExerciseId, sets);
  return true;
};

/**
 * Locks the Workout Exercise of one of the User's sets; the Workout
 * Exercise's id, or `undefined`.
 */
const lockWorkoutExerciseOf = async (
  tx: Transaction,
  userId: string,
  setId: string
) => {
  const [row] = await tx
    .select({ id: workoutExercises.id })
    .from(workoutExerciseSets)
    .innerJoin(
      workoutExercises,
      eq(workoutExercises.id, workoutExerciseSets.workoutExerciseId)
    )
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .where(and(eq(workoutExerciseSets.id, setId), eq(plans.userId, userId)))
    .for("no key update", { of: workoutExercises });
  return row?.id;
};

/**
 * Removes one of the User's sets, then renumbers its Workout Exercise's
 * remaining sets from 1. Returns `false`, changing nothing, when the User has
 * no such set (already removed, or never theirs). Removing an Exercise's last
 * set is allowed, as it was in `ai-agent`.
 */
export const removeSetFromExercise = async (
  tx: Transaction,
  userId: string,
  setId: string
): Promise<boolean> => {
  const workoutExerciseId = await lockWorkoutExerciseOf(tx, userId, setId);
  if (!workoutExerciseId) {
    return false;
  }
  const removed = await tx
    .delete(workoutExerciseSets)
    .where(eq(workoutExerciseSets.id, setId))
    .returning({ id: workoutExerciseSets.id });
  if (removed.length === 0) {
    return false;
  }
  await renumber(
    tx,
    workoutExerciseSets,
    eq(workoutExerciseSets.workoutExerciseId, workoutExerciseId)
  );
  return true;
};

/**
 * Changes only the given targets of one of the User's sets. Returns the set,
 * or `null`, changing nothing, when the User has no such set. One UPDATE, so
 * it needs no lock of its own.
 */
export const updateSetRecommendations = async (
  tx: Transaction,
  userId: string,
  setId: string,
  changes: Partial<PlanSetInput>
): Promise<PlanSet | null> => {
  const [updated] = await tx
    .update(workoutExerciseSets)
    .set({
      repsRecommended: changes.reps_recommended,
      restRecommended: changes.rest_recommended,
      updatedAt: sql`now()`,
      weightRecommended:
        changes.weight_recommended === undefined
          ? undefined
          : String(changes.weight_recommended),
    })
    .where(
      and(
        eq(workoutExerciseSets.id, setId),
        inArray(
          workoutExerciseSets.workoutExerciseId,
          tx
            .select({ id: workoutExercises.id })
            .from(workoutExercises)
            .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
            .innerJoin(plans, eq(plans.id, workouts.planId))
            .where(eq(plans.userId, userId))
        )
      )
    )
    .returning({
      id: workoutExerciseSets.id,
      order: workoutExerciseSets.order,
      repsRecommended: workoutExerciseSets.repsRecommended,
      restRecommended: workoutExerciseSets.restRecommended,
      weightRecommended: workoutExerciseSets.weightRecommended,
    });
  if (!updated) {
    return null;
  }
  return {
    id: updated.id,
    order: updated.order,
    reps_recommended: updated.repsRecommended,
    rest_recommended: updated.restRecommended,
    // numeric columns arrive as strings
    weight_recommended: Number(updated.weightRecommended),
  };
};
