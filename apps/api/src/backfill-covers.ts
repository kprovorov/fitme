import { type MuscleGroup, pickCovers } from "@fitme/core";
import {
  plans,
  type Transaction,
  withService,
  workoutExercises,
  workouts,
} from "@fitme/db";
import type { Library } from "@fitme/library-sdk";
import { and, asc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

/** The Library answered no Covers: there is nothing to assign. */
export class NoCoversError extends Error {
  constructor() {
    super(
      "The Library has no Covers; publish them before running the backfill"
    );
    this.name = "NoCoversError";
  }
}

/** How many Workouts of each Plan got (or, on a dry run, would get) a Cover. */
export interface BackfillReport {
  plans: Array<{ covered: number; planId: string }>;
  /** Workouts written; always 0 on a dry run. */
  written: number;
}

export interface BackfillOptions {
  /** Count what would be covered, write nothing and take no locks. */
  dryRun?: boolean;
  library: Library;
  /** One line per Plan and a total: ids and counts only, never User data. */
  log?: (line: string) => void;
  /** Only these Plans (a smoke run, or tests sharing a stack); every Plan by default. */
  planIds?: readonly string[];
  random?: () => number;
}

/** A live Plan's Workouts still without a Cover. */
const uncovered = (planIds?: readonly string[]): SQL | undefined =>
  and(
    isNull(plans.deletedAt),
    isNull(workouts.cover),
    planIds ? inArray(plans.id, [...planIds]) : undefined
  );

/** The Plans with an uncovered Workout, and those Workouts' Exercise slugs. */
const listPending = async (tx: Transaction, planIds?: readonly string[]) => {
  const rows = await tx
    .selectDistinct({
      planId: plans.id,
      slug: workoutExercises.exerciseSlug,
    })
    .from(workouts)
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .where(uncovered(planIds))
    .orderBy(asc(plans.id));
  const ids = [...new Set(rows.map((row) => row.planId))];
  const slugs = [
    ...new Set(rows.flatMap((row) => (row.slug === null ? [] : [row.slug]))),
  ];
  return { planIds: ids, slugs };
};

interface CoverPlanOptions {
  covers: Parameters<typeof pickCovers>[0]["covers"];
  dryRun: boolean;
  muscleGroupsOf: (slug: string) => readonly MuscleGroup[];
  random?: () => number;
}

/**
 * Picks a Cover for each of the live Plan's Workouts without one, keeping the
 * Covers its other Workouts have as used, and writes them unless it's a dry
 * run. Answers how many Workouts it covered (or would cover).
 */
const coverPlan = async (
  tx: Transaction,
  planId: string,
  { covers, dryRun, muscleGroupsOf, random }: CoverPlanOptions
) => {
  if (!dryRun) {
    // Workout edits' first lock, so this queues behind an account deletion
    // like they do; the row locks below then hold off a concurrent edit or
    // replacement of the Plan's Workouts until the Covers are written
    await tx.execute(sql`lock table ${workouts} in row exclusive mode`);
  }
  const select = tx
    .select({ cover: workouts.cover, id: workouts.id })
    .from(workouts)
    .innerJoin(plans, eq(plans.id, workouts.planId))
    .where(and(eq(plans.id, planId), isNull(plans.deletedAt)))
    .orderBy(asc(workouts.order), asc(workouts.id));
  const planWorkouts = dryRun
    ? await select
    : await select.for("no key update", { of: workouts });

  const toCover = planWorkouts.filter((workout) => workout.cover === null);
  if (toCover.length === 0) {
    return 0;
  }
  const exercises = await tx
    .select({
      slug: workoutExercises.exerciseSlug,
      workoutId: workoutExercises.workoutId,
    })
    .from(workoutExercises)
    .where(
      inArray(
        workoutExercises.workoutId,
        toCover.map((workout) => workout.id)
      )
    )
    .orderBy(asc(workoutExercises.order), asc(workoutExercises.id));

  const picks = pickCovers({
    covers,
    random,
    usedCoverIds: planWorkouts.flatMap((workout) =>
      workout.cover === null ? [] : [workout.cover]
    ),
    workouts: toCover.map((workout) => ({
      exercises: exercises
        .filter((exercise) => exercise.workoutId === workout.id)
        .map((exercise) => ({ muscleGroups: muscleGroupsOf(exercise.slug) })),
    })),
  });
  if (dryRun) {
    return toCover.length;
  }

  let written = 0;
  for (const [index, workout] of toCover.entries()) {
    const cover = picks[index];
    if (!cover) {
      continue;
    }
    // `cover is null` again: a Workout that got a Cover meanwhile keeps it.
    // biome-ignore lint/performance/noAwaitInLoops: one transaction runs one statement at a time
    const updated = await tx
      .update(workouts)
      .set({ cover })
      .where(and(eq(workouts.id, workout.id), isNull(workouts.cover)))
      .returning({ id: workouts.id });
    written += updated.length;
  }
  return written;
};

/**
 * Gives every Workout of a live Plan without a Cover one (ADR 0014): the
 * one-off backfill for Workouts created before Covers. It reads the Library's
 * Covers and the pending Workouts' Exercises, then covers one Plan per
 * transaction through `withService`, with `@fitme/core`'s picker, keeping the
 * Plan's existing Covers as used. A Workout with a Cover is never changed, so
 * a second run writes nothing.
 *
 * Throws `NoCoversError` when the Library has no Covers, and any Library
 * failure as it is, before anything is written.
 */
export const backfillCovers = async ({
  dryRun = false,
  library,
  log = console.log,
  planIds,
  random,
}: BackfillOptions): Promise<BackfillReport> => {
  const libraryCovers = await library.covers();
  if (libraryCovers.length === 0) {
    throw new NoCoversError();
  }
  const covers = libraryCovers.map((cover) => ({
    id: cover.id,
    muscleGroups: cover.muscle_groups,
  }));

  const pending = await withService((tx) => listPending(tx, planIds));
  const { data } =
    pending.slugs.length > 0
      ? await library.lookup(pending.slugs)
      : { data: [] };
  // A slug the Library doesn't know trains nothing: the picker falls back to
  // any Cover for it
  const muscleGroups = new Map(
    data.map((exercise) => [exercise.slug, exercise.muscle_groups])
  );
  const muscleGroupsOf = (slug: string) => muscleGroups.get(slug) ?? [];

  const report: BackfillReport = { plans: [], written: 0 };
  for (const planId of pending.planIds) {
    // biome-ignore lint/performance/noAwaitInLoops: one Plan at a time keeps the load on production small
    const covered = await withService((tx) =>
      coverPlan(tx, planId, { covers, dryRun, muscleGroupsOf, random })
    );
    if (covered === 0) {
      continue;
    }
    report.plans.push({ covered, planId });
    if (!dryRun) {
      report.written += covered;
    }
    log(`plan ${planId}: ${covered} ${dryRun ? "to cover" : "covered"}`);
  }

  const workoutCount = report.plans.reduce(
    (sum, plan) => sum + plan.covered,
    0
  );
  log(
    `${dryRun ? "Dry run: would cover" : "Covered"} ${workoutCount} Workouts in ${report.plans.length} Plans`
  );
  return report;
};
