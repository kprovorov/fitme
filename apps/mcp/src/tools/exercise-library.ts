import {
  type ExerciseLibrary,
  type ExerciseSummary,
  exerciseNameFromSlug,
} from "@fitme/exercise-library";
import type { PlanDetail } from "@fitme/services/plans";
import type { WorkoutSessionDetail } from "@fitme/services/workout-sessions";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import { ToolError } from "./helpers.js";

const MAX_SLUG_LENGTH = 100;

/** An Exercise by its Exercise slug; whether it exists is checked with the library. */
export const exerciseSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SLUG_LENGTH)
  .describe(
    "Exercise slug from list_exercises (its `slug`), e.g. `barbell-back-squat`."
  );

export const LIBRARY_UNAVAILABLE_MESSAGE =
  "Exercise Library unavailable, try again.";

/** Known Exercises by slug, from one lookup. */
export type KnownExercises = ReadonlyMap<string, ExerciseSummary>;

/**
 * Runs a call a tool can't answer without (a search, a write's slug check):
 * the library failing is reported, then shown as a `ToolError`.
 */
export async function fromLibrary<T>(
  ctx: ToolContext,
  call: (library: ExerciseLibrary) => Promise<T>
): Promise<T> {
  const library = ctx.getExerciseLibrary();
  try {
    return await call(library);
  } catch (error) {
    await ctx.reportError(error);
    throw new ToolError(LIBRARY_UNAVAILABLE_MESSAGE, { cause: error });
  }
}

const bySlug = (exercises: ExerciseSummary[]): KnownExercises =>
  new Map(exercises.map((exercise) => [exercise.slug, exercise]));

/**
 * Checks every slug a write carries with one lookup, before the services
 * open their transaction (ADR 0010): an unknown one is a `ToolError` naming
 * it, so nothing is written. Answers the Exercises, to name the result.
 */
export async function requireKnownSlugs(
  ctx: ToolContext,
  slugs: string[]
): Promise<KnownExercises> {
  const { data, missing } = await fromLibrary(ctx, (library) =>
    library.lookup(slugs)
  );
  if (missing.length > 0) {
    throw new ToolError(
      `Unknown exercise_slug(s): ${missing.join(", ")}. Use list_exercises to look up valid Exercise slugs.`
    );
  }
  return bySlug(data);
}

/**
 * The Exercises a read shows, looked up after its transaction. Never fails
 * the read: with the library failing (reported) or not configured, every
 * Exercise gets a name derived from its slug.
 */
export async function lookupForRead(
  ctx: ToolContext,
  slugs: string[]
): Promise<KnownExercises> {
  try {
    return bySlug((await ctx.getExerciseLibrary().lookup(slugs)).data);
  } catch (error) {
    if (!(error instanceof ToolError)) {
      await ctx.reportError(error);
    }
    return new Map();
  }
}

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

/** Swaps the legacy joined `exercise` for the slug, name and muscle groups. */
const named = <T extends WithSlug & { exercise: unknown }>(
  { exercise: _legacy, exercise_slug, ...rest }: T,
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
