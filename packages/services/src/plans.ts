import {
  exercises as exercisesTable,
  plans,
  type Transaction,
  workoutExerciseSets as workoutExerciseSetsTable,
  workoutExercises as workoutExercisesTable,
  workouts as workoutsTable,
} from "@fitme/db";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { jsonTimestamp } from "./json-timestamp";

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

/** A Workout in a Plan summary: its Exercises are only counted. */
export interface WorkoutSummary {
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
  exercise: { id: string; muscle_groups: unknown; name: string };
  id: string;
  order: number;
  sets: PlanSet[];
}

export interface PlanWorkout {
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
    where: planId ? livePlanOf(userId, planId) : livePlansOf(userId),
    with: {
      workouts: {
        columns: { id: true, name: true, order: true },
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
export const listPlans = (
  tx: Transaction,
  userId: string
): Promise<PlanSummary[]> => findPlanSummaries(tx, userId);

/**
 * One of the User's live Plans in full, or `null` when it doesn't exist, was
 * soft-deleted or belongs to another User. One statement, so one snapshot.
 * Runs in `tx` from `asUser`.
 */
export const getPlan = async (
  tx: Transaction,
  userId: string,
  planId: string
): Promise<PlanDetail | null> => {
  const row = await tx.query.plans.findFirst({
    ...planQuery,
    where: livePlanOf(userId, planId),
    with: {
      workouts: {
        columns: { description: true, id: true, name: true, order: true },
        orderBy: (workout, { asc }) => [asc(workout.order), asc(workout.id)],
        with: {
          workoutExercises: {
            columns: { id: true, order: true },
            orderBy: (exercise, { asc }) => [
              asc(exercise.order),
              asc(exercise.id),
            ],
            with: {
              exercise: {
                columns: { id: true, muscleGroups: true, name: true },
              },
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
        ({ exercise, workoutExerciseSets, ...workoutExercise }) => ({
          exercise: {
            id: exercise.id,
            muscle_groups: exercise.muscleGroups,
            name: exercise.name,
          },
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
  if (deleted) {
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
  return existing
    ? { alreadyDeleted: true, deleted: true, plan: existing }
    : null;
};

/**
 * Makes one of the User's live Plans the active one and deactivates every
 * other Plan of the User, so at most one Plan is active (the `activate_plan`
 * RPC, which the mobile app still calls: change both together). Returns the
 * activated Plan's summary, or `null` without changing anything when the User
 * has no such live Plan (missing, soft-deleted or another User's).
 * Runs in `tx` from `asUser`.
 *
 * Concurrent activations for the same User serialize on the first statement,
 * which row-locks every Plan of the User (taking the same table lock as the
 * RPC's UPDATE, so it queues cleanly behind `deleteUserData`). Nothing is
 * written until the target is known to be live. The statements after it see
 * everything those activations committed, including a Plan one of them
 * created and activated, so the last activation wins. The RPC locks in scan
 * order instead, so a concurrent RPC call can still deadlock with this; Postgres
 * aborts one of them and at most one Plan stays active either way.
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
  if (!target) {
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

export interface PlanExerciseInput {
  /** A library Exercise (exercises.id). */
  exercise_id: string;
  /** In the order they are performed. */
  sets: PlanSetInput[];
}

export interface PlanWorkoutInput {
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

/** Thrown before anything is written when a Plan names unknown Exercises. */
export class UnknownExercisesError extends Error {
  readonly exerciseIds: string[];

  constructor(exerciseIds: string[]) {
    super(`Unknown exercise_id(s): ${exerciseIds.join(", ")}`);
    this.name = "UnknownExercisesError";
    this.exerciseIds = exerciseIds;
  }
}

/**
 * Throws `UnknownExercisesError` when any Workout names an Exercise that
 * doesn't exist, which the inserts would otherwise abort on with an opaque
 * foreign-key violation.
 */
const assertExercisesExist = async (
  tx: Transaction,
  planWorkouts: PlanWorkoutInput[]
) => {
  const ids = [
    ...new Set(
      planWorkouts.flatMap((workout) =>
        workout.exercises.map((exercise) => exercise.exercise_id)
      )
    ),
  ];
  if (ids.length === 0) {
    return;
  }
  const known = new Set(
    (
      await tx
        .select({ id: exercisesTable.id })
        .from(exercisesTable)
        .where(inArray(exercisesTable.id, ids))
    ).map((row) => row.id)
  );
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new UnknownExercisesError(unknown);
  }
};

/** The plans columns for the metadata fields given (`undefined` = unchanged). */
const metadataColumns = (metadata: Partial<PlanMetadata>) => {
  const columns = {
    description: metadata.description,
    experienceLevel: metadata.experience_level,
    frequency: metadata.frequency,
    goal: metadata.goal,
    name: metadata.name,
    note: metadata.note,
    place: metadata.place,
    workoutDuration: metadata.workout_duration,
  };
  return Object.fromEntries(
    Object.entries(columns).filter(([, value]) => value !== undefined)
  ) as Partial<typeof columns>;
};

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
      exerciseId: exercise.exercise_id,
      order: index + 1,
      workoutId: workoutIds.get(workoutIndex + 1) as string,
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
      `${exercise.workoutId}:${exercise.order}`,
      exercise.id,
    ])
  );
  const setRows = planWorkouts.flatMap((workout, workoutIndex) =>
    workout.exercises.flatMap((exercise, exerciseIndex) => {
      const workoutExerciseId = exerciseIds.get(
        `${workoutIds.get(workoutIndex + 1)}:${exerciseIndex + 1}`
      ) as string;
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

/**
 * Creates a Plan for the User with its Workouts, Exercises and sets, in array
 * order, and makes it the User's active Plan (the `create_plan` RPC, which the
 * mobile app still calls: change both together). Returns the Plan in full.
 * Runs in `tx` from `asUser`, so it commits fully or not at all; RLS and the
 * retired-id triggers refuse a `userId` other than the caller's own.
 * Throws `UnknownExercisesError`, before writing anything, for unknown
 * Exercises.
 */
export const createPlan = async (
  tx: Transaction,
  userId: string,
  plan: NewPlan
): Promise<PlanDetail> => {
  await assertExercisesExist(tx, plan.workouts);
  const [created] = await tx
    .insert(plans)
    .values({ ...metadataColumns(plan), userId } as typeof plans.$inferInsert)
    .returning({ id: plans.id });
  await insertWorkouts(tx, created.id, plan.workouts);
  await activatePlan(tx, userId, created.id);
  return (await getPlan(tx, userId, created.id)) as PlanDetail;
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
 * link to their Workout), as the `update_plan` RPC does, which the mobile app
 * still calls: change both together. Does not change which Plan is active.
 * Runs in `tx` from `asUser`, so it commits fully or not at all.
 *
 * The Plan row is locked first, by its UPDATE, before any Workout, the order
 * the RPC and `finish_workout_session` take their locks in. Throws
 * `UnknownExercisesError` for unknown Exercises, which rolls back the
 * transaction.
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
  if (!updated) {
    return null;
  }
  if (newWorkouts) {
    await assertExercisesExist(tx, newWorkouts);
    await tx.delete(workoutsTable).where(eq(workoutsTable.planId, planId));
    await insertWorkouts(tx, planId, newWorkouts);
  }
  return getPlan(tx, userId, planId);
};
