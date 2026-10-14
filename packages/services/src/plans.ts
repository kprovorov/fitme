import {
  exercises,
  plans,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * A timestamp as Postgres encodes it in JSON (what PostgREST returned), e.g.
 * `2026-10-14T20:42:57.711123+00:00`, instead of `pg`'s text format.
 */
const jsonTimestamp = (column: AnyPgColumn): SQL<string | null> =>
  sql<string | null>`to_json(${column}) #>> '{}'`;

const planColumns = {
  created_at: jsonTimestamp(plans.createdAt),
  description: plans.description,
  experience_level: plans.experienceLevel,
  frequency: plans.frequency,
  goal: plans.goal,
  id: plans.id,
  is_active: plans.isActive,
  name: plans.name,
  note: plans.note,
  place: plans.place,
  updated_at: jsonTimestamp(plans.updatedAt),
  workout_duration: plans.workoutDuration,
};

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

/** Looks rows up by a key: each key's rows, in the rows' order. */
const lookupBy = <T>(rows: T[], key: (row: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row));
    if (group) {
      group.push(row);
    } else {
      groups.set(key(row), [row]);
    }
  }
  return (id: string) => groups.get(id) ?? [];
};

const livePlansOf = (userId: string) =>
  and(eq(plans.userId, userId), isNull(plans.deletedAt));

/**
 * The User's live (not soft-deleted) Plans, newest first, each with its
 * Workouts in rotation order and their Exercise counts. Runs in `tx` from
 * `asUser`; RLS hides every other User's Plans as well.
 */
export const listPlans = async (
  tx: Transaction,
  userId: string
): Promise<PlanSummary[]> => {
  const rows = await tx
    .select(planColumns)
    .from(plans)
    .where(livePlansOf(userId))
    .orderBy(desc(plans.createdAt), asc(plans.id));
  if (rows.length === 0) {
    return [];
  }
  const planWorkouts = await tx
    .select({
      exercise_count: count(workoutExercises.id),
      id: workouts.id,
      name: workouts.name,
      order: workouts.order,
      planId: workouts.planId,
    })
    .from(workouts)
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .where(
      inArray(
        workouts.planId,
        rows.map((plan) => plan.id)
      )
    )
    .groupBy(workouts.id)
    .orderBy(asc(workouts.order), asc(workouts.id));
  const workoutsOf = lookupBy(planWorkouts, (workout) => workout.planId);
  return rows.map((plan) => ({
    ...plan,
    workouts: workoutsOf(plan.id).map(
      ({ planId: _planId, ...workout }) => workout
    ),
  }));
};

/** The Workouts of a Plan in full, each level in order. */
const loadWorkouts = async (
  tx: Transaction,
  planId: string
): Promise<PlanWorkout[]> => {
  const planWorkouts = await tx
    .select({
      description: workouts.description,
      id: workouts.id,
      name: workouts.name,
      order: workouts.order,
    })
    .from(workouts)
    .where(eq(workouts.planId, planId))
    .orderBy(asc(workouts.order), asc(workouts.id));
  if (planWorkouts.length === 0) {
    return [];
  }
  const workoutExerciseRows = await tx
    .select({
      exercise: {
        id: exercises.id,
        muscle_groups: exercises.muscleGroups,
        name: exercises.name,
      },
      id: workoutExercises.id,
      order: workoutExercises.order,
      workoutId: workoutExercises.workoutId,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(
      inArray(
        workoutExercises.workoutId,
        planWorkouts.map((workout) => workout.id)
      )
    )
    .orderBy(asc(workoutExercises.order), asc(workoutExercises.id));
  const setRows =
    workoutExerciseRows.length === 0
      ? []
      : await tx
          .select({
            id: workoutExerciseSets.id,
            order: workoutExerciseSets.order,
            reps_recommended: workoutExerciseSets.repsRecommended,
            rest_recommended: workoutExerciseSets.restRecommended,
            weight_recommended: workoutExerciseSets.weightRecommended,
            workoutExerciseId: workoutExerciseSets.workoutExerciseId,
          })
          .from(workoutExerciseSets)
          .where(
            inArray(
              workoutExerciseSets.workoutExerciseId,
              workoutExerciseRows.map((row) => row.id)
            )
          )
          .orderBy(asc(workoutExerciseSets.order), asc(workoutExerciseSets.id));
  const setsOf = lookupBy(setRows, (set) => set.workoutExerciseId);
  const exercisesOf = lookupBy(workoutExerciseRows, (row) => row.workoutId);
  return planWorkouts.map((workout) => ({
    ...workout,
    exercises: exercisesOf(workout.id).map(
      ({ workoutId: _workoutId, ...exercise }) => ({
        ...exercise,
        sets: setsOf(exercise.id).map(
          ({
            weight_recommended,
            workoutExerciseId: _workoutExerciseId,
            ...set
          }) => ({
            ...set,
            // numeric columns arrive as strings; PostgREST returned numbers
            weight_recommended: Number(weight_recommended),
          })
        ),
      })
    ),
  }));
};

/**
 * One of the User's live Plans in full, or `null` when it doesn't exist, was
 * soft-deleted or belongs to another User. Runs in `tx` from `asUser`.
 */
export const getPlan = async (
  tx: Transaction,
  userId: string,
  planId: string
): Promise<PlanDetail | null> => {
  const [plan] = await tx
    .select(planColumns)
    .from(plans)
    .where(and(livePlansOf(userId), eq(plans.id, planId)));
  if (!plan) {
    return null;
  }
  return { ...plan, workouts: await loadWorkouts(tx, plan.id) };
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
