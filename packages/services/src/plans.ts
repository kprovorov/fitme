import {
  plans,
  workoutExerciseSets as workoutExerciseSetsTable,
  workoutExercises as workoutExercisesTable,
  workouts as workoutsTable,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { jsonTimestamp } from "./json-timestamp";
import { recordWeeklyGoal } from "./weekly-goals";

/** A Plan's own columns, without its Workouts. */
export interface PlanRow {
  created_at: string | null;
  description: string | null;
  experience_level: string;
  frequency: number;
  goal: string;
  id: string;
  is_active: boolean;
  name: string | null;
  note: string | null;
  place: string;
  updated_at: string | null;
  workout_duration: number;
}

/**
 * A Workout's Cover: the id of a Library photo (ADR 0014), `null` until one is
 * assigned. Stored as given, never checked.
 */
type Cover = string | null;

/** A Workout in a Plan summary: its Exercises are only counted. */
export interface WorkoutSummary {
  cover: Cover;
  exercise_count: number;
  id: string;
  name: string;
  order: number;
}

/** A Plan with its Workouts in rotation order (the first is up next). */
export interface PlanSummary extends PlanRow {
  workouts: WorkoutSummary[];
}

export interface PlanSet {
  id: string;
  order: number;
  reps_recommended: number;
  rest_recommended: number;
  /** In the User's unit (kg for metric, lbs for us/uk), never converted. */
  weight_recommended: number;
}

export interface PlanExercise {
  /**
   * The Exercise, by its Exercise slug: details come from the Exercise
   * Library API.
   */
  exercise_slug: string;
  id: string;
  order: number;
  sets: PlanSet[];
}

export interface PlanWorkout {
  cover: Cover;
  description: string;
  exercises: PlanExercise[];
  id: string;
  name: string;
  order: number;
}

/** A Plan in full: Workouts, their Exercises and sets, each in order. */
export interface PlanDetail extends PlanRow {
  workouts: PlanWorkout[];
}

/** The Plan columns of a relational query, timestamps in PostgREST's format. */
const planQuery = {
  columns: {
    description: true,
    experienceLevel: true,
    frequency: true,
    goal: true,
    id: true,
    isActive: true,
    name: true,
    note: true,
    place: true,
    workoutDuration: true,
  },
  extras: {
    createdAtJson: jsonTimestamp(plans.createdAt).as("created_at_json"),
    updatedAtJson: jsonTimestamp(plans.updatedAt).as("updated_at_json"),
  },
} as const;

interface PlanQueryRow {
  createdAtJson: string | null;
  description: string | null;
  experienceLevel: string;
  frequency: number;
  goal: string;
  id: string;
  isActive: boolean;
  name: string | null;
  note: string | null;
  place: string;
  updatedAtJson: string | null;
  workoutDuration: number;
}

const toPlanRow = (plan: PlanQueryRow): PlanRow => ({
  created_at: plan.createdAtJson,
  description: plan.description,
  experience_level: plan.experienceLevel,
  frequency: plan.frequency,
  goal: plan.goal,
  id: plan.id,
  is_active: plan.isActive,
  name: plan.name,
  note: plan.note,
  place: plan.place,
  updated_at: plan.updatedAtJson,
  workout_duration: plan.workoutDuration,
});

const livePlansOf = (userId: string) =>
  and(eq(plans.userId, userId), isNull(plans.deletedAt));

const livePlanOf = (userId: string, planId: string) =>
  and(livePlansOf(userId), eq(plans.id, planId));

/**
 * Summaries of the User's live Plans (only `planId` when given), newest
 * first, in one statement.
 */
const findPlanSummaries = async (
  tx: Transaction,
  userId: string,
  planId?: string
): Promise<PlanSummary[]> => {
  const rows = await tx.query.plans.findMany({
    ...planQuery,
    orderBy: (plan, { asc, desc }) => [desc(plan.createdAt), asc(plan.id)],
    where:
      planId !== undefined && planId !== ""
        ? livePlanOf(userId, planId)
        : livePlansOf(userId),
    with: {
      workouts: {
        columns: { cover: true, id: true, name: true, order: true },
        orderBy: (workout, { asc }) => [asc(workout.order), asc(workout.id)],
        with: { workoutExercises: { columns: { id: true } } },
      },
    },
  });

  return rows.map(({ workouts, ...plan }) => ({
    ...toPlanRow(plan),
    workouts: workouts.map(({ workoutExercises, ...workout }) => ({
      exercise_count: workoutExercises.length,
      ...workout,
    })),
  }));
};

/**
 * The User's live (not soft-deleted) Plans, newest first, each with its
 * Workouts in rotation order and their Exercise counts. One statement, so one
 * snapshot: a concurrent update never mixes old and new rows. Runs in `tx`
 * from `asUser`; RLS hides every other User's Plans as well.
 */
export const listPlans = async (
  tx: Transaction,
  userId: string
): Promise<PlanSummary[]> => await findPlanSummaries(tx, userId);

/** The first Plan matching `where` in full, in one statement. */
const findPlanDetail = async (
  tx: Transaction,
  where: SQL | undefined
): Promise<PlanDetail | null> => {
  const row = await tx.query.plans.findFirst({
    ...planQuery,
    where,
    with: {
      workouts: {
        columns: {
          cover: true,
          description: true,
          id: true,
          name: true,
          order: true,
        },
        orderBy: (workout, { asc }) => [asc(workout.order), asc(workout.id)],
        with: {
          workoutExercises: {
            columns: { exerciseSlug: true, id: true, order: true },
            orderBy: (exercise, { asc }) => [
              asc(exercise.order),
              asc(exercise.id),
            ],
            with: {
              workoutExerciseSets: {
                columns: {
                  id: true,
                  order: true,
                  repsRecommended: true,
                  restRecommended: true,
                  weightRecommended: true,
                },
                orderBy: (set, { asc }) => [asc(set.order), asc(set.id)],
              },
            },
          },
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  const { workouts, ...plan } = row;

  return {
    ...toPlanRow(plan),
    workouts: workouts.map(({ workoutExercises, ...workout }) => ({
      ...workout,
      exercises: workoutExercises.map(
        ({ exerciseSlug, workoutExerciseSets, ...workoutExercise }) => ({
          exercise_slug: exerciseSlug,
          ...workoutExercise,
          sets: workoutExerciseSets.map((set) => ({
            id: set.id,
            order: set.order,
            reps_recommended: set.repsRecommended,
            rest_recommended: set.restRecommended,
            // numeric columns arrive as strings; PostgREST returned numbers
            weight_recommended: Number(set.weightRecommended),
          })),
        })
      ),
    })),
  };
};

/**
 * One of the User's live Plans in full, or `null` when it doesn't exist, was
 * soft-deleted or belongs to another User. One statement, so one snapshot.
 * Runs in `tx` from `asUser`.
 */
export const getPlan = async (
  tx: Transaction,
  userId: string,
  planId: string
): Promise<PlanDetail | null> =>
  await findPlanDetail(tx, livePlanOf(userId, planId));

/**
 * The User's active Plan in full, or `null` when none is active. A
 * soft-deleted Plan is never active (`deactivate_deleted_plan`), but it is
 * filtered out too. One statement, so one snapshot. Runs in `tx` from
 * `asUser`; RLS hides every other User's Plans as well.
 */
export const getActivePlan = async (
  tx: Transaction,
  userId: string
): Promise<PlanDetail | null> =>
  await findPlanDetail(tx, and(livePlansOf(userId), eq(plans.isActive, true)));

export interface DeletedPlan {
  /** True when the Plan was already soft-deleted, so nothing changed. */
  alreadyDeleted: boolean;
  deleted: true;
  plan: { id: string; name: string | null };
}

/**
 * Soft-deletes one of the User's Plans (the app's delete): it disappears from
 * `listPlans` and `getPlan`, and the `deactivate_deleted_plan` trigger clears
 * its active flag. Logged Workout Sessions are kept. Deleting a Plan that is
 * already soft-deleted changes nothing; `null` means the User has no such Plan.
 * Runs in `tx` from `asUser`.
 */
export const deletePlan = async (
  tx: Transaction,
  userId: string,
  planId: string
): Promise<DeletedPlan | null> => {
  const [deleted] = await tx
    .update(plans)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(livePlanOf(userId, planId))
    .returning({ id: plans.id, name: plans.name });

  if (deleted !== undefined) {
    // The active Plan gone, the Weekly goal is too
    await recordWeeklyGoal(tx, userId);

    return { alreadyDeleted: false, deleted: true, plan: deleted };
  }

  const [existing] = await tx
    .select({ id: plans.id, name: plans.name })
    .from(plans)
    .where(
      and(
        eq(plans.userId, userId),
        eq(plans.id, planId),
        isNotNull(plans.deletedAt)
      )
    );

  return existing === undefined
    ? null
    : { alreadyDeleted: true, deleted: true, plan: existing };
};

/**
 * Makes one of the User's live Plans the active one and deactivates every
 * other Plan of the User, so at most one Plan is active. Returns the
 * activated Plan's summary, or `null` without changing anything when the User
 * has no such live Plan (missing, soft-deleted or another User's).
 * Runs in `tx` from `asUser`.
 *
 * Concurrent activations for the same User serialize on the first statement,
 * which row-locks every Plan of the User (taking the same table lock as an
 * UPDATE, so it queues cleanly behind `deleteUserData`). Nothing is
 * written until the target is known to be live. The statements after it see
 * everything those activations committed, including a Plan one of them
 * created and activated, so the last activation wins.
 */
export const activatePlan = async (
  tx: Transaction,
  userId: string,
  planId: string
): Promise<PlanSummary | null> => {
  // A no-op UPDATE, so the table lock is ROW EXCLUSIVE before any row is
  // locked; its subquery row-locks the Plans in id order, so two of these
  // never deadlock on each other.
  await tx
    .update(plans)
    .set({ isActive: sql`${plans.isActive}` })
    .where(
      inArray(
        plans.id,
        tx
          .select({ id: plans.id })
          .from(plans)
          .where(eq(plans.userId, userId))
          .orderBy(plans.id)
          .for("update")
      )
    );

  const [target] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(livePlanOf(userId, planId));

  if (target === undefined) {
    return null;
  }

  await tx
    .update(plans)
    .set({ isActive: sql`(${plans.id} = ${planId})` })
    .where(
      and(
        eq(plans.userId, userId),
        or(eq(plans.isActive, true), eq(plans.id, planId))
      )
    );
  await recordWeeklyGoal(tx, userId);
  const [activated] = await findPlanSummaries(tx, userId, planId);

  return activated ?? null;
};

/** A set to perform, as a Plan write takes it. */
export interface PlanSetInput {
  reps_recommended: number;
  rest_recommended: number;
  /** In the User's unit (kg for metric, lbs for us/uk), never converted. */
  weight_recommended: number;
}

/**
 * An Exercise as a write names it, by its Exercise slug. The slug isn't
 * checked here: that's the tool layer's job (ADR 0010).
 */
export interface PlanExerciseInput {
  exercise_slug: string;
  /** In the order they are performed. */
  sets: PlanSetInput[];
}

export interface PlanWorkoutInput {
  /**
   * The Workout's Cover id, chosen by the caller (services never choose one);
   * none stores `null`.
   */
  cover?: string | null;
  description: string;
  /** In the order they are performed. */
  exercises: PlanExerciseInput[];
  name: string;
}

/** A Plan's own columns, as a Plan write takes them. */
export interface PlanMetadata {
  description: string;
  experience_level: string;
  frequency: number;
  goal: string;
  name: string;
  note?: string | null;
  place: string;
  workout_duration: number;
}

/** A Plan to create; every `order` comes from the array positions (1-based). */
export interface NewPlan extends PlanMetadata {
  /** In rotation order. */
  workouts: PlanWorkoutInput[];
}

interface PlanMetadataColumns<M extends Partial<PlanMetadata>> {
  description: M["description"];
  experienceLevel: M["experience_level"];
  frequency: M["frequency"];
  goal: M["goal"];
  name: M["name"];
  note: M["note"];
  place: M["place"];
  workoutDuration: M["workout_duration"];
}

/**
 * The plans columns for the metadata fields given. Drizzle leaves a column
 * whose value is `undefined` out of an UPDATE's SET (and an INSERT gives it
 * its default), so a field not given stays unchanged.
 */
const metadataColumns = <M extends Partial<PlanMetadata>>(
  metadata: M
): PlanMetadataColumns<M> => ({
  description: metadata.description,
  experienceLevel: metadata.experience_level,
  frequency: metadata.frequency,
  goal: metadata.goal,
  name: metadata.name,
  note: metadata.note,
  place: metadata.place,
  workoutDuration: metadata.workout_duration,
});

/** A row id the statement before just returned, by its key. */
const insertedId = <K>(ids: Map<K, string>, key: K) => {
  const id = ids.get(key);

  if (id === undefined) {
    throw new Error(`No inserted row for ${String(key)}`);
  }

  return id;
};

/** Keys a Workout Exercise by its Workout and its position in it. */
const exerciseKey = (workoutId: string, order: number) =>
  `${workoutId}:${order}`;

/**
 * Inserts a Plan's Workouts, their Exercises and sets, each `order` from its
 * array position (1-based): one statement per table. Rows are matched to
 * their parents by `order`, never by the order RETURNING lists them in.
 */
const insertWorkouts = async (
  tx: Transaction,
  planId: string,
  planWorkouts: PlanWorkoutInput[]
) => {
  if (planWorkouts.length === 0) {
    return;
  }

  const insertedWorkouts = await tx
    .insert(workoutsTable)
    .values(
      planWorkouts.map((workout, index) => ({
        cover: workout.cover ?? null,
        description: workout.description,
        name: workout.name,
        order: index + 1,
        planId,
      }))
    )
    .returning({ id: workoutsTable.id, order: workoutsTable.order });

  const workoutIds = new Map(
    insertedWorkouts.map((workout) => [workout.order, workout.id])
  );

  const exerciseRows = planWorkouts.flatMap((workout, workoutIndex) =>
    workout.exercises.map((exercise, index) => ({
      exerciseSlug: exercise.exercise_slug,
      order: index + 1,
      workoutId: insertedId(workoutIds, workoutIndex + 1),
    }))
  );

  if (exerciseRows.length === 0) {
    return;
  }

  const insertedExercises = await tx
    .insert(workoutExercisesTable)
    .values(exerciseRows)
    .returning({
      id: workoutExercisesTable.id,
      order: workoutExercisesTable.order,
      workoutId: workoutExercisesTable.workoutId,
    });

  const exerciseIds = new Map(
    insertedExercises.map((exercise) => [
      exerciseKey(exercise.workoutId, exercise.order),
      exercise.id,
    ])
  );

  const setRows = planWorkouts.flatMap((workout, workoutIndex) =>
    workout.exercises.flatMap((exercise, exerciseIndex) => {
      const workoutExerciseId = insertedId(
        exerciseIds,
        exerciseKey(insertedId(workoutIds, workoutIndex + 1), exerciseIndex + 1)
      );

      return exercise.sets.map((set, index) => ({
        order: index + 1,
        repsRecommended: set.reps_recommended,
        restRecommended: set.rest_recommended,
        weightRecommended: String(set.weight_recommended),
        workoutExerciseId,
      }));
    })
  );

  if (setRows.length > 0) {
    await tx.insert(workoutExerciseSetsTable).values(setRows);
  }
};

/** How a Plan is created. */
export interface CreatePlanOptions {
  /**
   * Make it the User's active Plan, every other one inactive (default
   * `true`). With `false` it's created inactive and the active Plan stays.
   */
  activate?: boolean;
}

/**
 * Creates a Plan for the User with its Workouts, Exercises and sets, in array
 * order, and by default makes it the User's active Plan. Returns the Plan in
 * full.
 * Runs in `tx` from `asUser`, so it commits fully or not at all; RLS and the
 * retired-id triggers refuse a `userId` other than the caller's own.
 * Exercise slugs aren't checked.
 */
export const createPlan = async (
  tx: Transaction,
  userId: string,
  plan: NewPlan,
  { activate = true }: CreatePlanOptions = {}
): Promise<PlanDetail> => {
  const [created] = await tx
    .insert(plans)
    .values({ ...metadataColumns(plan), userId })
    .returning({ id: plans.id });

  await insertWorkouts(tx, created.id, plan.workouts);

  if (activate) {
    await activatePlan(tx, userId, created.id);
  }

  const detail = await getPlan(tx, userId, created.id);

  if (!detail) {
    throw new Error(`Plan ${created.id} vanished after it was created`);
  }

  return detail;
};

/**
 * Changes to a Plan: only the metadata fields given (`note: null` clears the
 * note) and, with `workouts`, the complete new list of Workouts.
 */
export interface PlanChanges extends Partial<PlanMetadata> {
  /** Replaces every Workout, in rotation order. */
  workouts?: PlanWorkoutInput[];
}

/**
 * Updates one of the User's live Plans and returns it in full, or `null`
 * without changing anything when the User has no such live Plan (missing,
 * soft-deleted or another User's). Only the given metadata fields change,
 * plus `updated_at`. Without `workouts` the Workouts and their ids stay; with
 * `workouts` every Workout is deleted and recreated from the list, in array
 * order (new ids; past Workout Sessions keep their logged sets but lose the
 * link to their Workout). Does not change which Plan is active.
 * Runs in `tx` from `asUser`, so it commits fully or not at all.
 *
 * The Plan row is locked first, by its UPDATE, before any Workout, the order
 * `finishWorkoutSession` takes its locks in. Exercise slugs
 * aren't checked.
 */
export const updatePlan = async (
  tx: Transaction,
  userId: string,
  planId: string,
  { workouts: newWorkouts, ...metadata }: PlanChanges
): Promise<PlanDetail | null> => {
  const [updated] = await tx
    .update(plans)
    .set({ ...metadataColumns(metadata), updatedAt: sql`now()` })
    .where(livePlanOf(userId, planId))
    .returning({ id: plans.id });

  if (updated === undefined) {
    return null;
  }

  if (metadata.frequency !== undefined) {
    // A no-op unless it's the active Plan's frequency that changed
    await recordWeeklyGoal(tx, userId);
  }

  if (newWorkouts) {
    await tx.delete(workoutsTable).where(eq(workoutsTable.planId, planId));
    await insertWorkouts(tx, planId, newWorkouts);
  }

  return await getPlan(tx, userId, planId);
};

/** A set as a whole-Plan save takes it: with its id when it's kept. */
export interface SavedPlanSet extends PlanSetInput {
  id?: string;
}

/** A Workout Exercise as a whole-Plan save takes it: with its id when it's kept. */
export interface SavedPlanExercise {
  exercise_slug: string;
  id?: string;
  /** In the order they are performed. */
  sets: SavedPlanSet[];
}

/** A Workout as a whole-Plan save takes it: with its id when it's kept. */
export interface SavedPlanWorkout {
  /** None clears it (stored as an empty description). */
  description?: string;
  /** In the order they are performed. */
  exercises: SavedPlanExercise[];
  id?: string;
  name: string;
}

/**
 * A whole Plan as the Plan builder saves it (ADR 0016): every detail (an
 * optional one left out is cleared) and every Workout, Workout Exercise and
 * set it keeps, each with the id it was read with, plus new ones without.
 */
export interface SavedPlan extends Omit<PlanMetadata, "description"> {
  description?: string;
  /** In rotation order. */
  workouts: SavedPlanWorkout[];
}

export interface SavePlanOptions {
  /**
   * Picks the Covers of the Workouts the save creates: given them, in the
   * order they're sent, and the Cover ids the kept Workouts hold (read in the
   * save's own transaction), it answers one per new Workout, in that order.
   * Services never choose one (ADR 0014); without it the new Workouts get none.
   */
  coverNewWorkouts?: (
    newWorkouts: SavedPlanWorkout[],
    usedCoverIds: string[]
  ) => (string | null)[];
}

export type SavePlanResult =
  | { plan: PlanDetail; status: "saved" }
  /**
   * An id that isn't one of this Plan's rows, sits under another parent than
   * the one it was sent under, or is sent twice; nothing was written.
   */
  | { ids: string[]; status: "invalid_ids" }
  | { status: "not_found" };

/** The ids a Plan has, each with its parent's. */
interface PlanTree {
  exerciseWorkout: Map<string, string>;
  setExercise: Map<string, string>;
  workoutCover: Map<string, string | null>;
}

/**
 * Row-locks the Plan's Workouts and Workout Exercises (`FOR NO KEY UPDATE`,
 * in that order, the order Arnold's edits lock them in) and reads every id of
 * the Plan with its parent's.
 */
const lockPlanTree = async (
  tx: Transaction,
  planId: string
): Promise<PlanTree> => {
  const workoutRows = await tx
    .select({ cover: workoutsTable.cover, id: workoutsTable.id })
    .from(workoutsTable)
    .where(eq(workoutsTable.planId, planId))
    .orderBy(workoutsTable.id)
    .for("no key update");

  const workoutIds = workoutRows.map((workout) => workout.id);

  const exerciseRows =
    workoutIds.length === 0
      ? []
      : await tx
          .select({
            id: workoutExercisesTable.id,
            workoutId: workoutExercisesTable.workoutId,
          })
          .from(workoutExercisesTable)
          .where(inArray(workoutExercisesTable.workoutId, workoutIds))
          .orderBy(workoutExercisesTable.id)
          .for("no key update");

  const exerciseIds = exerciseRows.map((exercise) => exercise.id);

  const setRows =
    exerciseIds.length === 0
      ? []
      : await tx
          .select({
            id: workoutExerciseSetsTable.id,
            workoutExerciseId: workoutExerciseSetsTable.workoutExerciseId,
          })
          .from(workoutExerciseSetsTable)
          .where(
            inArray(workoutExerciseSetsTable.workoutExerciseId, exerciseIds)
          );

  return {
    exerciseWorkout: new Map(
      exerciseRows.map((exercise) => [exercise.id, exercise.workoutId])
    ),
    setExercise: new Map(setRows.map((set) => [set.id, set.workoutExerciseId])),
    workoutCover: new Map(
      workoutRows.map((workout) => [workout.id, workout.cover])
    ),
  };
};

/**
 * The sent ids the save can't keep: one that isn't the Plan's, sits under
 * another parent than the one it's sent under (a kept row is never moved, and
 * a new row's children are new too), or is sent more than once.
 */
const invalidIds = (tree: PlanTree, workouts: SavedPlanWorkout[]) => {
  const seen = new Set<string>();
  const invalid = new Set<string>();

  /** Accepts `id` when it's new to the body and `belongs`. */
  const check = (id: string, belongs: boolean) => {
    if (seen.has(id) || !belongs) {
      invalid.add(id);
    }

    seen.add(id);
  };

  for (const workout of workouts) {
    if (workout.id !== undefined) {
      check(workout.id, tree.workoutCover.has(workout.id));
    }

    for (const exercise of workout.exercises) {
      if (exercise.id !== undefined) {
        check(
          exercise.id,
          workout.id !== undefined &&
            tree.exerciseWorkout.get(exercise.id) === workout.id
        );
      }

      for (const set of exercise.sets) {
        if (set.id !== undefined) {
          check(
            set.id,
            exercise.id !== undefined &&
              tree.setExercise.get(set.id) === exercise.id
          );
        }
      }
    }
  }

  return [...invalid];
};

/** `id` as Postgres prints a uuid (lowercase), so it compares with the ones read. */
const lowercase = <T extends { id?: string }>(row: T): T =>
  row.id === undefined ? row : { ...row, id: row.id.toLowerCase() };

/** The Workouts with every id as Postgres prints it. */
const withLowercaseIds = (workouts: SavedPlanWorkout[]) =>
  workouts.map((workout) => ({
    ...lowercase(workout),
    exercises: workout.exercises.map((exercise) => ({
      ...lowercase(exercise),
      sets: exercise.sets.map(lowercase),
    })),
  }));

/** The ids of the rows a list sends with one. */
const keptIds = (rows: readonly { id?: string }[]) =>
  rows.flatMap((row) => (row.id === undefined ? [] : [row.id]));

/**
 * Deletes the Plan's rows the save leaves out, parents first: a left-out
 * Workout takes its Workout Exercises and sets with it (a cascade), and its
 * Workout Sessions lose the link (`ON DELETE SET NULL`).
 */
const deleteLeftOut = async (
  tx: Transaction,
  planId: string,
  savedWorkouts: SavedPlanWorkout[]
) => {
  const keptWorkoutIds = keptIds(savedWorkouts);
  const savedExercises = savedWorkouts.flatMap((workout) => workout.exercises);
  const keptExerciseIds = keptIds(savedExercises);
  await tx
    .delete(workoutsTable)
    .where(
      and(
        eq(workoutsTable.planId, planId),
        notInArray(workoutsTable.id, keptWorkoutIds)
      )
    );
  await tx
    .delete(workoutExercisesTable)
    .where(
      and(
        inArray(workoutExercisesTable.workoutId, keptWorkoutIds),
        notInArray(workoutExercisesTable.id, keptExerciseIds)
      )
    );
  await tx
    .delete(workoutExerciseSetsTable)
    .where(
      and(
        inArray(workoutExerciseSetsTable.workoutExerciseId, keptExerciseIds),
        notInArray(
          workoutExerciseSetsTable.id,
          keptIds(savedExercises.flatMap((exercise) => exercise.sets))
        )
      )
    );
};

/** `(id, …)` rows of a VALUES list, for one UPDATE … FROM of kept rows. */
const valuesList = (rows: SQL[]) => sql.join(rows, sql`, `);

/**
 * Updates the kept Workouts in place (never their Cover) and inserts the new
 * ones with the Cover picked for each; answers every Workout's id, in the
 * order sent.
 */
const saveWorkouts = async (
  tx: Transaction,
  planId: string,
  savedWorkouts: SavedPlanWorkout[],
  newCovers: Map<SavedPlanWorkout, string | null>
): Promise<string[]> => {
  const kept = savedWorkouts.flatMap((workout, index) =>
    workout.id === undefined
      ? []
      : [
          sql`(${workout.id}::uuid, ${index + 1}::integer, ${workout.name}::text, ${workout.description ?? ""}::text)`,
        ]
  );

  if (kept.length > 0) {
    await tx.execute(sql`
      update ${workoutsTable} set
        "order" = v.position, name = v.name, description = v.description,
        updated_at = now()
      from (values ${valuesList(kept)}) as v(id, position, name, description)
      where ${workoutsTable.id} = v.id`);
  }

  const added = savedWorkouts.flatMap((workout, index) =>
    workout.id === undefined
      ? [
          {
            cover: newCovers.get(workout) ?? null,
            description: workout.description ?? "",
            name: workout.name,
            order: index + 1,
            planId,
          },
        ]
      : []
  );

  const inserted =
    added.length === 0
      ? []
      : await tx
          .insert(workoutsTable)
          .values(added)
          .returning({ id: workoutsTable.id, order: workoutsTable.order });

  const insertedIds = new Map(inserted.map((row) => [row.order, row.id]));

  return savedWorkouts.map(
    (workout, index) => workout.id ?? insertedId(insertedIds, index + 1)
  );
};

/**
 * Updates the kept Workout Exercises in place and inserts the new ones under
 * their Workout (`workoutIds`, in the order sent); answers every Workout
 * Exercise's id, in the order of `savedWorkouts`' Exercises flattened.
 */
const saveExercises = async (
  tx: Transaction,
  savedWorkouts: SavedPlanWorkout[],
  workoutIds: string[]
): Promise<string[]> => {
  const rows = savedWorkouts.flatMap((workout, workoutIndex) =>
    workout.exercises.map((exercise, index) => ({
      exercise,
      order: index + 1,
      workoutId: workoutIds[workoutIndex],
    }))
  );

  const kept = rows.flatMap(({ exercise, order }) =>
    exercise.id === undefined
      ? []
      : [
          sql`(${exercise.id}::uuid, ${order}::integer, ${exercise.exercise_slug}::text)`,
        ]
  );

  if (kept.length > 0) {
    await tx.execute(sql`
      update ${workoutExercisesTable} set
        "order" = v.position, exercise_slug = v.slug, updated_at = now()
      from (values ${valuesList(kept)}) as v(id, position, slug)
      where ${workoutExercisesTable.id} = v.id`);
  }

  const added = rows.flatMap(({ exercise, order, workoutId }) =>
    exercise.id === undefined
      ? [{ exerciseSlug: exercise.exercise_slug, order, workoutId }]
      : []
  );

  const inserted =
    added.length === 0
      ? []
      : await tx.insert(workoutExercisesTable).values(added).returning({
          id: workoutExercisesTable.id,
          order: workoutExercisesTable.order,
          workoutId: workoutExercisesTable.workoutId,
        });

  const insertedIds = new Map(
    inserted.map((row) => [exerciseKey(row.workoutId, row.order), row.id])
  );

  return rows.map(
    ({ exercise, order, workoutId }) =>
      exercise.id ?? insertedId(insertedIds, exerciseKey(workoutId, order))
  );
};

/**
 * Updates the kept sets in place and inserts the new ones under their Workout
 * Exercise (`exerciseIds`, in the order of `savedExercises`).
 */
const saveSets = async (
  tx: Transaction,
  savedExercises: SavedPlanExercise[],
  exerciseIds: string[]
) => {
  const rows = savedExercises.flatMap((exercise, exerciseIndex) =>
    exercise.sets.map((set, index) => ({
      order: index + 1,
      set,
      workoutExerciseId: exerciseIds[exerciseIndex],
    }))
  );

  const kept = rows.flatMap(({ order, set }) =>
    set.id === undefined
      ? []
      : [
          sql`(${set.id}::uuid, ${order}::integer, ${set.reps_recommended}::integer, ${set.rest_recommended}::integer, ${String(set.weight_recommended)}::numeric)`,
        ]
  );

  if (kept.length > 0) {
    await tx.execute(sql`
      update ${workoutExerciseSetsTable} set
        "order" = v.position, reps_recommended = v.reps,
        rest_recommended = v.rest, weight_recommended = v.weight,
        updated_at = now()
      from (values ${valuesList(kept)}) as v(id, position, reps, rest, weight)
      where ${workoutExerciseSetsTable.id} = v.id`);
  }

  const added = rows.flatMap(({ order, set, workoutExerciseId }) =>
    set.id === undefined
      ? [
          {
            order,
            repsRecommended: set.reps_recommended,
            restRecommended: set.rest_recommended,
            weightRecommended: String(set.weight_recommended),
            workoutExerciseId,
          },
        ]
      : []
  );

  if (added.length > 0) {
    await tx.insert(workoutExerciseSetsTable).values(added);
  }
};

/**
 * Saves a whole Plan of the User (ADR 0016): its details, then each Workout,
 * Workout Exercise and set in the order sent. A row sent with its id is
 * updated in place (a Workout keeps its Cover), one sent without is created
 * (a Workout with the Cover `coverNewWorkouts` picks), and a row of the Plan
 * the body leaves out is deleted, its Workout Sessions keeping their logged
 * sets but losing the link to a deleted Workout. Every `order` comes from the
 * array positions (1-based). An optional detail left out is cleared. Doesn't
 * change which Plan is active, and records the Weekly goal (a change only when
 * the active Plan's frequency changed). Returns the Plan in full.
 *
 * `not_found` (missing, soft-deleted or another User's Plan) and
 * `invalid_ids` change nothing. Runs in `tx` from `asUser`, so it commits
 * fully or not at all; the last save wins, with no version check.
 *
 * The Plan row is locked first, then its Workouts, then its Workout
 * Exercises: the order `updatePlan`, `finishWorkoutSession` and Arnold's edits
 * take theirs in. Exercise slugs aren't checked.
 */
export const savePlan = async (
  tx: Transaction,
  userId: string,
  planId: string,
  { workouts: sentWorkouts, ...details }: SavedPlan,
  { coverNewWorkouts }: SavePlanOptions = {}
): Promise<SavePlanResult> => {
  const [locked] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(livePlanOf(userId, planId))
    .for("no key update");

  if (locked === undefined) {
    return { status: "not_found" };
  }

  const tree = await lockPlanTree(tx, planId);
  const savedWorkouts = withLowercaseIds(sentWorkouts);
  const invalid = invalidIds(tree, savedWorkouts);

  if (invalid.length > 0) {
    return { ids: invalid, status: "invalid_ids" };
  }

  await tx
    .update(plans)
    .set({
      ...metadataColumns(details),
      // Left out clears them, rather than leaving them as they were
      description: details.description ?? null,
      note: details.note ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(plans.id, planId));

  const keptWorkoutIds = keptIds(savedWorkouts);
  await deleteLeftOut(tx, planId, savedWorkouts);

  const newWorkouts = savedWorkouts.filter((w) => w.id === undefined);

  const covers =
    coverNewWorkouts?.(
      newWorkouts,
      keptWorkoutIds.flatMap((id) => {
        const cover = tree.workoutCover.get(id);

        return cover !== undefined && cover !== null && cover !== ""
          ? [cover]
          : [];
      })
    ) ?? [];

  const workoutIds = await saveWorkouts(
    tx,
    planId,
    savedWorkouts,
    new Map(newWorkouts.map((workout, i) => [workout, covers[i] ?? null]))
  );

  const exerciseIds = await saveExercises(tx, savedWorkouts, workoutIds);
  await saveSets(
    tx,
    savedWorkouts.flatMap((workout) => workout.exercises),
    exerciseIds
  );

  await recordWeeklyGoal(tx, userId);
  const plan = await getPlan(tx, userId, planId);

  if (!plan) {
    throw new Error(`Plan ${planId} vanished while it was saved`);
  }

  return { plan, status: "saved" };
};
