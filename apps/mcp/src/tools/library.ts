import { pickCovers } from "@fitme/core/covers";
import { MAX_EXERCISE_SLUG_LENGTH } from "@fitme/core/limits";
import type { MuscleGroup } from "@fitme/core/models";
import type { IndexCover } from "@fitme/library-bundle/library-index";
import { exerciseNameFromSlug } from "@fitme/library-sdk";
import type { ExerciseSummary, Library } from "@fitme/library-sdk";
import type { PlanDetail } from "@fitme/services/plans";
import type { WorkoutSessionDetail } from "@fitme/services/workout-sessions";
import { z } from "zod";

import type { ToolContext } from "../context.js";
import { ToolError } from "./helpers.js";

/** An Exercise by its Exercise slug; whether it exists is checked against the Library index. */
export const exerciseSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_EXERCISE_SLUG_LENGTH)
  .describe(
    "Exercise slug from list_exercises (its `slug`), e.g. `barbell-back-squat`."
  );

export const LIBRARY_UNAVAILABLE_MESSAGE = "Library unavailable, try again.";

/** Known Exercises by slug, from one Library API lookup (reads). */
export type KnownExercises = ReadonlyMap<string, ExerciseSummary>;

/**
 * Runs a call a tool can't answer without (a search, `get_exercise`):
 * the library failing is reported, then shown as a `ToolError`.
 */
export const fromLibrary = async <T>(
  ctx: ToolContext,
  call: (library: Library) => Promise<T>
): Promise<T> => {
  const library = ctx.getLibrary();

  try {
    return await call(library);
  } catch (error) {
    await ctx.reportError(error);
    throw new ToolError(LIBRARY_UNAVAILABLE_MESSAGE, { cause: error });
  }
};

const bySlug = (exercises: ExerciseSummary[]): KnownExercises =>
  new Map(exercises.map((exercise) => [exercise.slug, exercise]));

/**
 * What the Library index (ADR 0018) says about a write's slugs, once every
 * one is known: their muscle groups, and the Covers to pick from.
 */
export interface CheckedSlugs {
  covers: IndexCover[];
  /** Each known slug's muscle groups, as the bundle writes them. */
  muscleGroups: ReadonlyMap<string, readonly string[]>;
}

/**
 * Checks every slug a write carries against the Library index, before the
 * services open their transaction (ADR 0010, ADR 0018), so no write waits
 * on the Library API: an unknown one is a `ToolError` naming it, unreported,
 * and an index that can't be loaded (reported by the index itself) is the
 * Library tool error. Nothing is written either way.
 */
export const requireKnownSlugs = async (
  ctx: ToolContext,
  slugs: string[]
): Promise<CheckedSlugs> => {
  const found = await ctx.libraryIndex.lookup(slugs);

  if (found.status === "unavailable") {
    throw new ToolError(LIBRARY_UNAVAILABLE_MESSAGE);
  }

  if (found.missing.length > 0) {
    throw new ToolError(
      `Unknown exercise_slug(s): ${found.missing.join(", ")}. Use list_exercises to look up valid Exercise slugs.`
    );
  }

  return {
    covers: found.covers,
    muscleGroups: new Map(
      found.exercises.map((exercise) => [exercise.slug, exercise.muscle_groups])
    ),
  };
};

/**
 * Gives each Workout a write creates its Cover (ADR 0014), from the Covers
 * and muscle groups the write's slug check (`checked`) answered, distinct
 * within the Plan while there are enough; no Covers gives every Workout
 * `null`.
 */
export const withCovers = <W extends { exercises: WithSlug[] }>(
  workouts: W[],
  checked: CheckedSlugs
): (W & { cover: string | null })[] => {
  const picked = pickCovers({
    covers: checked.covers.map((cover) => ({
      id: cover.id,
      // SAFETY: pickCovers only compares muscle groups for equality, so one this build's MuscleGroup doesn't list is matched like any other.
      muscleGroups: cover.muscle_groups as MuscleGroup[],
    })),
    workouts: workouts.map((workout) => ({
      exercises: workout.exercises.map((exercise) => ({
        // SAFETY: as above, pickCovers only compares the groups for equality.
        muscleGroups: (checked.muscleGroups.get(exercise.exercise_slug) ??
          []) as MuscleGroup[],
      })),
    })),
  });

  return workouts.map((workout, index) => ({
    ...workout,
    cover: picked[index] ?? null,
  }));
};

/**
 * The Exercises a read shows, looked up after its transaction. Never fails
 * the read: with the library failing (reported) or not configured, every
 * Exercise gets a name derived from its slug.
 */
export const lookupForRead = async (
  ctx: ToolContext,
  slugs: string[]
): Promise<KnownExercises> => {
  try {
    const result = await ctx.getLibrary().lookup(slugs);

    return bySlug(result.data);
  } catch (error) {
    if (!(error instanceof ToolError)) {
      await ctx.reportError(error);
    }

    return new Map();
  }
};

/** An Exercise as the tools show it: its slug, name and muscle groups. */
const exerciseRef = (slug: string, known: KnownExercises) => {
  const exercise = known.get(slug);

  return {
    exercise_slug: slug,
    muscle_groups: exercise?.muscle_groups ?? [],
    name: exercise?.name ?? exerciseNameFromSlug(slug),
  };
};

interface WithSlug {
  exercise_slug: string;
}

/** Adds the name and muscle groups next to the slug. */
const named = <T extends WithSlug>(
  { exercise_slug, ...rest }: T,
  known: KnownExercises
) => ({ ...rest, ...exerciseRef(exercise_slug, known) });

export const sessionSlugs = (session: WorkoutSessionDetail) =>
  session.exercises.map((exercise) => exercise.exercise_slug);

/** Slugs in the order workouts carry them, a write's or a Plan's. */
export const workoutSlugs = (workouts: { exercises: WithSlug[] }[]) =>
  workouts.flatMap((workout) =>
    workout.exercises.map((exercise) => exercise.exercise_slug)
  );

export const namePlan = (plan: PlanDetail, known: KnownExercises) => ({
  ...plan,
  workouts: plan.workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => named(exercise, known)),
  })),
});

export const nameSession = (
  session: WorkoutSessionDetail,
  known: KnownExercises
) => ({
  ...session,
  exercises: session.exercises.map((exercise) => named(exercise, known)),
});

/** A Plan read with its Exercises named, looked up after the transaction. */
export const namedPlan = async (ctx: ToolContext, plan: PlanDetail) =>
  namePlan(plan, await lookupForRead(ctx, workoutSlugs(plan.workouts)));

/** A Workout Session read with its Exercises named, looked up after the transaction. */
export const namedSession = async (
  ctx: ToolContext,
  session: WorkoutSessionDetail
) => nameSession(session, await lookupForRead(ctx, sessionSlugs(session)));
