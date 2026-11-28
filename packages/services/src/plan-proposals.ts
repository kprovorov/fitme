import { createHash } from "node:crypto";

import {
  plans,
  weeklyGoalChanges,
  workoutExerciseSets as workoutExerciseSetsTable,
  workoutExercises as workoutExercisesTable,
  workoutSessions,
  workouts as workoutsTable,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getPlan, savePlan } from "./plans";
import type {
  PlanDetail,
  PlanSet,
  PlanWorkout,
  SavedPlan,
  SavedPlanSet,
  SavedPlanWorkout,
  SavePlanOptions,
} from "./plans";

/**
 * A Plan's version marker (ADR 0027): a short hash of the Plan in full, its
 * details, the order of its Workouts and every Workout, Workout Exercise and
 * set with its id and targets. Two reads of an unchanged Plan give the same
 * marker; any change to one of those gives another: a Plan editor save, a
 * Plan Update, a finished Workout moving to the end of the rotation.
 * Activation and the timestamps don't count, since they change no row of the
 * Plan a proposal is merged into.
 */
export const planVersion = (plan: PlanDetail): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        plan.id,
        plan.name,
        plan.description,
        plan.note,
        plan.frequency,
        plan.goal,
        plan.place,
        plan.experience_level,
        plan.workout_duration,
        plan.workouts.map((workout) => [
          workout.id,
          workout.order,
          workout.name,
          workout.description,
          workout.cover,
          workout.exercises.map((exercise) => [
            exercise.id,
            exercise.order,
            exercise.exercise_slug,
            exercise.sets.map((set) => [
              set.id,
              set.order,
              set.reps_recommended,
              set.rest_recommended,
              set.weight_recommended,
            ]),
          ]),
        ]),
      ])
    )
    .digest("base64url")
    .slice(0, 22);

/**
 * The Plan details a proposal changes: each one left out stays as it is, and
 * `null` clears an optional one.
 */
export type PlanProposalDetails = Partial<Omit<SavedPlan, "workouts">>;

/** A Plan Proposal that changes a Plan, as Arnold read and changed it. */
export interface PlanProposal {
  /** The changed Plan details only. */
  details?: PlanProposalDetails;
  /** The marker of the Plan as Arnold read it (`planVersion`). */
  planVersion: string;
  /** Workouts to remove, by id. */
  removedWorkoutIds?: string[];
  /**
   * Changed Workouts in full, each with the id it was read under, and new
   * ones without. Every kept Workout Exercise and set keeps its id too; a
   * new one has none.
   */
  workouts?: SavedPlanWorkout[];
}

/** What a saved proposal changed, worked out from the Plan it was merged into. */
export interface PlanProposalChanges {
  exercisesAdded: number;
  exercisesRemoved: number;
  setsAdded: number;
  setsChanged: number;
  setsRemoved: number;
  workoutsAdded: number;
  workoutsChanged: number;
  workoutsRemoved: number;
}

export type SavePlanProposalResult =
  | { changes: PlanProposalChanges; planId: string; status: "saved" }
  /** The Plan changed since Arnold read it; nothing was written. */
  | { status: "plan_changed" }
  /**
   * An id that isn't one of this Plan's rows, sits under another parent than
   * the one it was sent under, or is sent twice; nothing was written.
   */
  | { ids: string[]; status: "invalid_ids" }
  /** It would leave the Plan with no Workout; nothing was written. */
  | { status: "no_workouts" }
  | { status: "not_found" };

/** `id` as Postgres prints a uuid (lowercase), so it compares with the ones read. */
const lowercaseId = (id: string) => id.toLowerCase();

/** The Workout with every id as Postgres prints it, as `savePlan` reads them. */
const withLowercaseIds = (workout: SavedPlanWorkout): SavedPlanWorkout => ({
  ...workout,
  exercises: workout.exercises.map((exercise) => ({
    ...exercise,
    id: exercise.id === undefined ? undefined : lowercaseId(exercise.id),
    sets: exercise.sets.map((set) => ({
      ...set,
      id: set.id === undefined ? undefined : lowercaseId(set.id),
    })),
  })),
});

/** A Workout as read, as the whole-Plan save takes it back unchanged. */
const savedWorkoutOf = (workout: PlanWorkout): SavedPlanWorkout => ({
  description: workout.description,
  exercises: workout.exercises.map((exercise) => ({
    exercise_slug: exercise.exercise_slug,
    id: exercise.id,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      reps_recommended: set.reps_recommended,
      rest_recommended: set.rest_recommended,
      weight_recommended: set.weight_recommended,
    })),
  })),
  id: workout.id,
  name: workout.name,
});

/** A weight as numeric(8,2) stores it, in hundredths. */
const hundredths = (weight: number) => Math.round(weight * 100);

const sameTargets = (read: PlanSet, sent: SavedPlanSet) =>
  read.reps_recommended === sent.reps_recommended &&
  read.rest_recommended === sent.rest_recommended &&
  hundredths(read.weight_recommended) === hundredths(sent.weight_recommended);

const countSets = (workout: SavedPlanWorkout | PlanWorkout) =>
  workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);

const noChanges = (): PlanProposalChanges => ({
  exercisesAdded: 0,
  exercisesRemoved: 0,
  setsAdded: 0,
  setsChanged: 0,
  setsRemoved: 0,
  workoutsAdded: 0,
  workoutsChanged: 0,
  workoutsRemoved: 0,
});

/** Every count together: each only grows, so a new total means a change. */
const totalOf = (changes: PlanProposalChanges): number =>
  Object.values<number>({ ...changes }).reduce(
    (sum: number, count: number) => sum + count,
    0
  );

/**
 * Adds what replacing `read` with `sent` changes to `changes`, and answers
 * whether it changed anything. An Exercise kept under its id but sent with
 * another slug is replaced: one removed and one added.
 */
const countWorkoutChange = (
  changes: PlanProposalChanges,
  read: PlanWorkout,
  sent: SavedPlanWorkout
) => {
  const before = totalOf(changes);
  const readExercises = new Map(read.exercises.map((e) => [e.id, e]));
  const keptExerciseIds = new Set<string>();

  for (const exercise of sent.exercises) {
    const kept =
      exercise.id === undefined ? undefined : readExercises.get(exercise.id);

    if (kept === undefined) {
      changes.exercisesAdded += 1;
      changes.setsAdded += exercise.sets.length;
      continue;
    }

    keptExerciseIds.add(kept.id);

    if (kept.exercise_slug !== exercise.exercise_slug) {
      changes.exercisesAdded += 1;
      changes.exercisesRemoved += 1;
    }

    const readSets = new Map(kept.sets.map((set) => [set.id, set]));
    const keptSetIds = new Set<string>();
    const changedSetIds = new Set<string>();

    for (const set of exercise.sets) {
      const keptSet = set.id === undefined ? undefined : readSets.get(set.id);

      if (keptSet === undefined) {
        changes.setsAdded += 1;
      } else {
        keptSetIds.add(keptSet.id);

        if (!sameTargets(keptSet, set)) {
          changedSetIds.add(keptSet.id);
        }
      }
    }

    changes.setsRemoved += kept.sets.filter(
      (set) => !keptSetIds.has(set.id)
    ).length;

    // A kept set moved to another place in its Exercise changes it too
    const sentOrder = exercise.sets.flatMap((set) =>
      set.id !== undefined && readSets.has(set.id) ? [set.id] : []
    );

    const readOrder = kept.sets.flatMap((set) =>
      keptSetIds.has(set.id) ? [set.id] : []
    );

    for (const [i, id] of sentOrder.entries()) {
      if (readOrder[i] !== id) {
        changedSetIds.add(id);
      }
    }

    changes.setsChanged += changedSetIds.size;
  }

  for (const exercise of read.exercises) {
    if (!keptExerciseIds.has(exercise.id)) {
      changes.exercisesRemoved += 1;
      changes.setsRemoved += exercise.sets.length;
    }
  }

  const keptExerciseOrder = sent.exercises.flatMap((exercise) =>
    exercise.id !== undefined && keptExerciseIds.has(exercise.id)
      ? [exercise.id]
      : []
  );

  const readExerciseOrder = read.exercises.flatMap((exercise) =>
    keptExerciseIds.has(exercise.id) ? [exercise.id] : []
  );

  return (
    totalOf(changes) !== before ||
    keptExerciseOrder.join(",") !== readExerciseOrder.join(",") ||
    read.name !== sent.name ||
    read.description !== (sent.description ?? "")
  );
};

interface Merged {
  changes: PlanProposalChanges;
  workouts: SavedPlanWorkout[];
}

/**
 * The Plan's Workouts with the proposal merged in: untouched ones as they are
 * and where they are, changed ones replaced in place, new ones at the end of
 * the rotation, removed ones gone. Answers the ids it can't place (not the
 * Plan's Workouts, or sent more than once) instead.
 */
const merge = (
  plan: PlanDetail,
  sentWorkouts: SavedPlanWorkout[],
  removedIds: string[]
): Merged | { invalid: string[] } => {
  const readWorkouts = new Map(plan.workouts.map((w) => [w.id, w]));
  const changed = new Map<string, SavedPlanWorkout>();
  const removed = new Set<string>();
  const invalid = new Set<string>();
  const added: SavedPlanWorkout[] = [];

  for (const workout of sentWorkouts) {
    if (workout.id === undefined) {
      added.push(workout);
      continue;
    }

    const id = lowercaseId(workout.id);

    if (!readWorkouts.has(id) || changed.has(id)) {
      invalid.add(workout.id);
    }

    changed.set(id, withLowercaseIds({ ...workout, id }));
  }

  for (const removedId of removedIds) {
    const id = lowercaseId(removedId);

    if (!readWorkouts.has(id) || removed.has(id) || changed.has(id)) {
      invalid.add(removedId);
    }

    removed.add(id);
  }

  if (invalid.size > 0) {
    return { invalid: [...invalid] };
  }

  const changes = noChanges();
  const workouts: SavedPlanWorkout[] = [];

  for (const workout of plan.workouts) {
    if (removed.has(workout.id)) {
      changes.workoutsRemoved += 1;
      changes.exercisesRemoved += workout.exercises.length;
      changes.setsRemoved += countSets(workout);
      continue;
    }

    const sent = changed.get(workout.id);

    if (sent === undefined) {
      workouts.push(savedWorkoutOf(workout));
      continue;
    }

    if (countWorkoutChange(changes, workout, sent)) {
      changes.workoutsChanged += 1;
    }

    workouts.push(sent);
  }

  for (const workout of added) {
    changes.workoutsAdded += 1;
    changes.exercisesAdded += workout.exercises.length;
    changes.setsAdded += countSets(workout);
    workouts.push(workout);
  }

  return { changes, workouts };
};

/** The Plan's details with the proposal's changed ones over them. */
const mergedDetails = (
  plan: PlanDetail,
  details: PlanProposalDetails
): Omit<SavedPlan, "workouts"> => ({
  description: details.description ?? plan.description ?? undefined,
  experience_level:
    details.experience_level === undefined
      ? plan.experience_level
      : details.experience_level,
  frequency: details.frequency ?? plan.frequency,
  goal: details.goal === undefined ? plan.goal : details.goal,
  name: details.name ?? plan.name ?? "",
  note: details.note === undefined ? plan.note : details.note,
  place: details.place === undefined ? plan.place : details.place,
  workout_duration:
    details.workout_duration === undefined
      ? plan.workout_duration
      : details.workout_duration,
});

/**
 * Takes ROW EXCLUSIVE on every table the save writes, in `deleteUserData`'s
 * order, so it queues behind an account deletion before it holds a row the
 * deletion needs. Then locks the Plan row, its Workouts, their Workout
 * Exercises and their sets
 * (`FOR NO KEY UPDATE`), in the order `savePlan` and Arnold's edits take
 * them, so the Plan read after them is the one the save writes over: an
 * Arnold edit, a finish or a Plan Update waits until this transaction ends. False for a
 * missing, soft-deleted or another User's Plan.
 */
const lockPlan = async (tx: Transaction, userId: string, planId: string) => {
  // Table locks first, in deleteUserData's order: taken after a row lock, an
  // account deletion holding them would wait on that row while the save's
  // writes wait on the deletion
  await tx.execute(sql`
    lock table ${plans}, ${workoutSessions}, ${workoutsTable},
      ${workoutExercisesTable}, ${workoutExerciseSetsTable}, ${weeklyGoalChanges}
    in row exclusive mode
  `);

  const [locked] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(
        eq(plans.userId, userId),
        isNull(plans.deletedAt),
        eq(plans.id, planId)
      )
    )
    .for("no key update");

  if (locked === undefined) {
    return false;
  }

  const workoutRows = await tx
    .select({ id: workoutsTable.id })
    .from(workoutsTable)
    .where(eq(workoutsTable.planId, planId))
    .orderBy(workoutsTable.id)
    .for("no key update");

  if (workoutRows.length === 0) {
    return true;
  }

  const exerciseRows = await tx
    .select({ id: workoutExercisesTable.id })
    .from(workoutExercisesTable)
    .where(
      inArray(
        workoutExercisesTable.workoutId,
        workoutRows.map((workout) => workout.id)
      )
    )
    .orderBy(workoutExercisesTable.id)
    .for("no key update");

  // Arnold's set target edit locks only the set itself
  if (exerciseRows.length > 0) {
    await tx
      .select({ id: workoutExerciseSetsTable.id })
      .from(workoutExerciseSetsTable)
      .where(
        inArray(
          workoutExerciseSetsTable.workoutExerciseId,
          exerciseRows.map((exercise) => exercise.id)
        )
      )
      .orderBy(workoutExerciseSetsTable.id)
      .for("no key update");
  }

  return true;
};

/**
 * Saves a Plan Proposal that changes one of the User's Plans (ADR 0027), in
 * `tx` from `asUser`. It locks and reads the Plan as the whole-Plan save
 * does; when the Plan's marker isn't the one the proposal was made from, it
 * answers `plan_changed` and writes nothing. Otherwise it merges the
 * proposal into the Plan and saves the result through `savePlan` in the same
 * transaction, so kept rows keep their ids, Covers and Workout Sessions, and
 * new Workouts get theirs from `coverNewWorkouts`. A missing, soft-deleted or
 * another User's Plan is `not_found`; an id that isn't the Plan's is
 * `invalid_ids`, as `savePlan` answers them.
 *
 * The answer counts what changed across the whole Plan: a new Workout's
 * Exercises and sets count as added, a removed one's as removed.
 */
export const savePlanProposal = async (
  tx: Transaction,
  userId: string,
  planId: string,
  {
    details = {},
    planVersion: readVersion,
    removedWorkoutIds = [],
    workouts = [],
  }: PlanProposal,
  options: SavePlanOptions = {}
): Promise<SavePlanProposalResult> => {
  if (!(await lockPlan(tx, userId, planId))) {
    return { status: "not_found" };
  }

  const plan = await getPlan(tx, userId, planId);

  if (plan === null) {
    return { status: "not_found" };
  }

  if (planVersion(plan) !== readVersion) {
    return { status: "plan_changed" };
  }

  const merged = merge(plan, workouts, removedWorkoutIds);

  if ("invalid" in merged) {
    return { ids: merged.invalid, status: "invalid_ids" };
  }

  if (merged.workouts.length === 0) {
    return { status: "no_workouts" };
  }

  const saved = await savePlan(
    tx,
    userId,
    planId,
    { ...mergedDetails(plan, details), workouts: merged.workouts },
    options
  );

  if (saved.status !== "saved") {
    return saved;
  }

  return { changes: merged.changes, planId: saved.plan.id, status: "saved" };
};
