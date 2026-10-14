import { plans, type Transaction } from "@fitme/db";
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
