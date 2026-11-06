import { pickCovers } from "@fitme/core";
import type { MuscleGroup } from "@fitme/core";
import { plans, withService, workoutExercises, workouts } from "@fitme/db";
import type { Transaction } from "@fitme/db";
import type { Library } from "@fitme/library-sdk";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

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
  plans: { covered: number; planId: string }[];
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

/** Each looked-up slug's muscle groups; one the Library doesn't know has none. */
type MuscleGroupsBySlug = Map<string, readonly MuscleGroup[]>;

interface CoverPlanOptions {
  covers: Parameters<typeof pickCovers>[0]["covers"];
  dryRun: boolean;
  known: MuscleGroupsBySlug;
  random?: () => number;
}

/**
 * How one Plan went: Workouts covered (or, on a dry run, to cover), or the
 * slugs its Workouts got since they were looked up, with nothing written.
 */
type CoverPlanResult = { covered: number } | { unknownSlugs: string[] };

/**
 * Picks a Cover for each of the live Plan's Workouts without one, keeping the
 * Covers its other Workouts have as used, and writes them unless it's a dry
 * run.
 */
const coverPlan = async (
  tx: Transaction,
  planId: string,
  { covers, dryRun, known, random }: CoverPlanOptions
): Promise<CoverPlanResult> => {
  if (!dryRun) {
    // Workout edits' first lock, so this queues behind an account deletion
    // like they do; then the Plan row before its Workouts' rows, the order
    // updatePlan and finishWorkoutSession lock in, so neither deadlocks with it
    await tx.execute(sql`lock table ${workouts} in row exclusive mode`);

    const [plan] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.id, planId), isNull(plans.deletedAt)))
      .for("no key update");

    if (!plan) {
      return { covered: 0 };
    }
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

  if (dryRun || toCover.length === 0) {
    return { covered: toCover.length };
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

  const unknownSlugs = [
    ...new Set(
      exercises.flatMap((exercise) =>
        known.has(exercise.slug) ? [] : [exercise.slug]
      )
    ),
  ];

  if (unknownSlugs.length > 0) {
    return { unknownSlugs };
  }

  const picks = pickCovers({
    covers,
    random,
    usedCoverIds: planWorkouts.flatMap((workout) =>
      workout.cover === null ? [] : [workout.cover]
    ),
    workouts: toCover.map((workout) => ({
      exercises: exercises.flatMap((exercise) =>
        exercise.workoutId === workout.id
          ? [{ muscleGroups: known.get(exercise.slug) ?? [] }]
          : []
      ),
    })),
  });

  // Chain statements: a transaction's connection runs one at a time.
  let writes = Promise.resolve(0);

  for (const [index, workout] of toCover.entries()) {
    writes = writes.then(async (count) => {
      const cover = picks[index];

      if (!cover) {
        return count;
      }

      // `cover is null` again: a Workout that got a Cover meanwhile keeps it.
      const updated = await tx
        .update(workouts)
        .set({ cover })
        .where(and(eq(workouts.id, workout.id), isNull(workouts.cover)))
        .returning({ id: workouts.id });

      return count + updated.length;
    });
  }

  const covered = await writes;

  return { covered };
};

/** Looks `slugs` up in one batch and adds their muscle groups to `known`. */
const learnSlugs = async (
  library: Library,
  known: MuscleGroupsBySlug,
  slugs: string[]
) => {
  if (slugs.length === 0) {
    return;
  }

  const { data, missing } = await library.lookup(slugs);

  for (const exercise of data) {
    known.set(exercise.slug, exercise.muscle_groups);
  }

  // A slug the Library doesn't know trains nothing: the picker falls back to
  // any Cover for it
  for (const slug of missing) {
    known.set(slug, []);
  }
};

/**
 * Gives every Workout of a live Plan without a Cover one (ADR 0014): the
 * one-off backfill for Workouts created before Covers. It reads the Library's
 * Covers and the pending Workouts' Exercises, then covers one Plan per
 * transaction through `withService`, with `@fitme/core`'s picker, keeping the
 * Plan's existing Covers as used. A Workout with a Cover is never changed, so
 * a second run writes nothing. A Plan whose Workouts got an Exercise since
 * the lookup is looked up again and retried once, then skipped (a rerun
 * covers it).
 *
 * Throws `NoCoversError` when the Library has no Covers, and any Library
 * failure as it is: before anything is written, or after the Plans already
 * covered.
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
  const known: MuscleGroupsBySlug = new Map();

  if (!dryRun) {
    await learnSlugs(library, known, pending.slugs);
  }

  const report: BackfillReport = { plans: [], written: 0 };

  const coverOnce = (planId: string) =>
    withService((tx) =>
      coverPlan(tx, planId, { covers, dryRun, known, random })
    );

  // Chain Plans to keep production load small and preserve lookup/picker order.
  let processing = Promise.resolve(report);

  for (const planId of pending.planIds) {
    processing = processing.then(async () => {
      let result = await coverOnce(planId);

      if ("unknownSlugs" in result) {
        await learnSlugs(library, known, result.unknownSlugs);
        result = await coverOnce(planId);
      }

      if ("unknownSlugs" in result) {
        log(`plan ${planId}: skipped, its Exercises changed during the run`);

        return report;
      }

      if (result.covered === 0) {
        return report;
      }

      report.plans.push({ covered: result.covered, planId });

      if (!dryRun) {
        report.written += result.covered;
      }

      log(
        `plan ${planId}: ${result.covered} ${dryRun ? "to cover" : "covered"}`
      );

      return report;
    });
  }

  await processing;

  const total = report.plans.reduce((sum, plan) => sum + plan.covered, 0);
  log(
    `${dryRun ? "Dry run: would cover" : "Covered"} ${total} Workouts in ${report.plans.length} Plans`
  );

  return report;
};
