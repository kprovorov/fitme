import { plans, type Transaction } from "@fitme/db";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
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

/**
 * The User's live (not soft-deleted) Plans, newest first, each with its
 * Workouts in rotation order and their Exercise counts. One statement, so one
 * snapshot: a concurrent update never mixes old and new rows. Runs in `tx`
 * from `asUser`; RLS hides every other User's Plans as well.
 */
export const listPlans = async (
  tx: Transaction,
  userId: string
): Promise<PlanSummary[]> => {
  const rows = await tx.query.plans.findMany({
    ...planQuery,
    orderBy: (plan, { asc, desc }) => [desc(plan.createdAt), asc(plan.id)],
    where: livePlansOf(userId),
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
    where: and(livePlansOf(userId), eq(plans.id, planId)),
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
    .where(and(livePlansOf(userId), eq(plans.id, planId)))
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
