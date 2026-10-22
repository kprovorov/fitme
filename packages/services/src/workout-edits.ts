import {
  exercises,
  plans,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { and, asc, count, eq, inArray, max, type SQL, sql } from "drizzle-orm";
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
 * Every edit that appends, removes or replaces first takes ROW EXCLUSIVE on
 * the Plan's child tables, in `deleteUserData`'s order, then row-locks the
 * parent whose children it appends to or renumbers (the Workout for its
 * Exercises, the Workout Exercise for its sets). The table locks come first so
 * an edit queues behind an account deletion before it holds any row the
 * deletion's cascade needs; taken later, the two deadlock. The row lock makes
 * concurrent edits of the same parent queue up, so `order` stays contiguous
 * from 1. `FOR NO KEY UPDATE` still lets other transactions insert rows
 * referencing the parent, and no edit locks anything above it, so they can't
 * deadlock with `updatePlan` or `finishWorkoutSession`, which lock the Plan
 * first.
 *
 * A durable Coach step can re-run after its tool committed. Removing,
 * replacing and updating are safe to repeat; the two appends take a
 * `requestKey`, stored on the row they add, and a repeated call with the same
 * key returns that row instead of adding another.
 */

/** The most sets a Workout Exercise may have, as MCP's plan tools allow. */
export const MAX_SETS_PER_EXERCISE = 20;

/** Thrown, before writing anything, by an append past `MAX_SETS_PER_EXERCISE`. */
export class TooManySetsError extends Error {
  readonly maxSets: number;

  constructor(maxSets: number) {
    super(`An exercise can have at most ${maxSets} sets`);
    this.name = "TooManySetsError";
    this.maxSets = maxSets;
  }
}

/** ROW EXCLUSIVE on the tables an edit writes, in `deleteUserData`'s order. */
const lockEditedTables = (tx: Transaction) =>
  tx.execute(sql`
    lock table ${workouts}, ${workoutExercises}, ${workoutExerciseSets}
    in row exclusive mode
  `);

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
const lockWorkoutByExercise = async (
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
 * such Workout Exercise. Throws `TooManySetsError`, before writing anything,
 * when it already has `MAX_SETS_PER_EXERCISE` sets (a repeat of the call that
 * added the last one still returns that set).
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
  await lockEditedTables(tx);
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
  const [{ last, sets }] = await tx
    .select({
      last: max(workoutExerciseSets.order),
      sets: count(workoutExerciseSets.id),
    })
    .from(workoutExerciseSets)
    .where(inExercise);
  if (sets >= MAX_SETS_PER_EXERCISE) {
    throw new TooManySetsError(MAX_SETS_PER_EXERCISE);
  }
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
 * An Exercise as an edit names it: by its Exercise slug, or (until the
 * contract step drops `exercise_id`) by its legacy uuid. The
 * `sync_exercise_slug` trigger fills in the other column. A slug isn't checked
 * here: that's the tool layer's job (ADR 0010).
 */
type EditExerciseRef =
  | { exerciseId: string; exerciseSlug?: undefined }
  | { exerciseId?: undefined; exerciseSlug: string };

/**
 * Throws `UnknownExercisesError` when the library has no Exercise with that
 * uuid, which the insert would otherwise abort on with an opaque foreign-key
 * violation. A slug isn't checked.
 */
const assertExerciseExists = async (
  tx: Transaction,
  { exerciseId }: EditExerciseRef
) => {
  if (exerciseId === undefined) {
    return;
  }
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
 * Appends a library Exercise, given by slug or uuid, after the last Exercise
 * of one of the User's Workouts, with its sets in array order. Returns the new
 * Workout Exercise, or `null` without changing anything when the User has no
 * such Workout. Throws `UnknownExercisesError`, before writing anything, for
 * an unknown uuid.
 */
export const addExerciseToWorkout = async (
  tx: Transaction,
  userId: string,
  {
    requestKey,
    sets,
    workoutId,
    ...exerciseRef
  }: EditExerciseRef & {
    requestKey?: string;
    sets: PlanSetInput[];
    workoutId: string;
  }
): Promise<AddedExercise | null> => {
  await lockEditedTables(tx);
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
  await assertExerciseExists(tx, exerciseRef);
  const [{ last }] = await tx
    .select({ last: max(workoutExercises.order) })
    .from(workoutExercises)
    .where(inWorkout);
  const [added] = await tx
    .insert(workoutExercises)
    .values({
      exerciseId: exerciseRef.exerciseId,
      exerciseSlug: exerciseRef.exerciseSlug,
      order: (last ?? 0) + 1,
      requestKey,
      workoutId,
    })
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
  await lockEditedTables(tx);
  const workoutId = await lockWorkoutByExercise(tx, userId, workoutExerciseId);
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

/** The Exercise slug of `exerciseRef`, or `undefined` for an unknown uuid. */
const slugOf = async (tx: Transaction, exerciseRef: EditExerciseRef) => {
  if (exerciseRef.exerciseSlug !== undefined) {
    return exerciseRef.exerciseSlug;
  }
  const [known] = await tx
    .select({ slug: exercises.slug })
    .from(exercises)
    .where(eq(exercises.id, exerciseRef.exerciseId));
  return known?.slug;
};

/**
 * Whether a Workout Exercise already is `exerciseRef` with exactly `sets`, in
 * order: what `replaceExerciseInWorkout` would leave behind. Compared by
 * Exercise slug, whichever form wrote the row.
 */
const isAlreadyReplaced = async (
  tx: Transaction,
  workoutExerciseId: string,
  exerciseRef: EditExerciseRef,
  sets: PlanSetInput[]
) => {
  const slug = await slugOf(tx, exerciseRef);
  const [current] = await tx
    .select({ exerciseSlug: workoutExercises.exerciseSlug })
    .from(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId));
  if (slug === undefined || current?.exerciseSlug !== slug) {
    return false;
  }
  // The weights as numeric(8,2) stores them, rounded by Postgres, not JS
  const {
    rows: [{ weights }],
  } = await tx.execute<{ weights: string[] }>(sql`
    select array[${sql.join(
      sets.map((set) => sql`${String(set.weight_recommended)}::numeric(8,2)`),
      sql`, `
    )}]::text[] as weights
  `);
  const currentSets = await tx
    .select({
      order: workoutExerciseSets.order,
      repsRecommended: workoutExerciseSets.repsRecommended,
      restRecommended: workoutExerciseSets.restRecommended,
      weightRecommended: workoutExerciseSets.weightRecommended,
    })
    .from(workoutExerciseSets)
    .where(eq(workoutExerciseSets.workoutExerciseId, workoutExerciseId))
    .orderBy(asc(workoutExerciseSets.order), asc(workoutExerciseSets.id));
  return (
    currentSets.length === sets.length &&
    currentSets.every(
      (set, index) =>
        set.order === index + 1 &&
        set.repsRecommended === sets[index].reps_recommended &&
        set.restRecommended === sets[index].rest_recommended &&
        set.weightRecommended === weights[index]
    )
  );
};

/** The Exercise to swap in, by slug or (until the contract step) uuid. */
type NewExerciseRef =
  | { newExerciseId: string; newExerciseSlug?: undefined }
  | { newExerciseId?: undefined; newExerciseSlug: string };

/**
 * Swaps the library Exercise of one of the User's Workout Exercises, keeping
 * its id and place in the Workout, and replaces all its sets with `sets`, in
 * array order. Returns `false`, changing nothing, when the User has no such
 * Workout Exercise. Throws `UnknownExercisesError`, before writing anything,
 * for an unknown uuid. When the Workout Exercise already is that Exercise
 * with exactly those sets (a repeated call), nothing is rewritten, so the set
 * ids a read in between handed out stay valid.
 */
export const replaceExerciseInWorkout = async (
  tx: Transaction,
  userId: string,
  {
    sets,
    workoutExerciseId,
    ...replacement
  }: NewExerciseRef & { sets: PlanSetInput[]; workoutExerciseId: string }
): Promise<boolean> => {
  const exerciseRef: EditExerciseRef =
    replacement.newExerciseSlug === undefined
      ? { exerciseId: replacement.newExerciseId }
      : { exerciseSlug: replacement.newExerciseSlug };
  await lockEditedTables(tx);
  if (!(await lockWorkoutExercise(tx, userId, workoutExerciseId))) {
    return false;
  }
  if (await isAlreadyReplaced(tx, workoutExerciseId, exerciseRef, sets)) {
    return true;
  }
  await assertExerciseExists(tx, exerciseRef);
  await tx
    .update(workoutExercises)
    .set({
      // A slug write sends the uuid too: the sync trigger would keep the old
      // one for a slug the legacy table doesn't know, so the row would still
      // join the replaced Exercise. NULL fails NOT NULL, as an insert does.
      exerciseId:
        exerciseRef.exerciseSlug === undefined
          ? exerciseRef.exerciseId
          : sql`(select ${exercises.id} from ${exercises} where ${exercises.slug} = ${exerciseRef.exerciseSlug})`,
      exerciseSlug: exerciseRef.exerciseSlug,
      updatedAt: sql`now()`,
    })
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
const lockWorkoutExerciseBySet = async (
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
  await lockEditedTables(tx);
  const workoutExerciseId = await lockWorkoutExerciseBySet(tx, userId, setId);
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
