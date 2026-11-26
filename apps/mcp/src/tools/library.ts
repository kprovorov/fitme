import { pickCovers } from "@fitme/core/covers";
import { MAX_EXERCISE_SLUG_LENGTH } from "@fitme/core/limits";
import type { LegacyMuscleGroup } from "@fitme/core/models";
import type {
  InMemoryLibrary,
  LibraryExerciseSummary,
} from "@fitme/library-bundle/in-memory-library";
import type { IndexCover } from "@fitme/library-bundle/library-index";
import { exerciseNameFromSlug } from "@fitme/library-sdk";
import type { PlanDetail } from "@fitme/services/plans";
import type { WorkoutSessionDetail } from "@fitme/services/workout-sessions";
import { z } from "zod";

import type { ToolContext } from "../context.js";
import { ToolError } from "./helpers.js";

/** An Exercise by its Exercise slug; whether it exists is checked against the Library. */
export const exerciseSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_EXERCISE_SLUG_LENGTH)
  .describe(
    "Exercise slug from list_exercises (its `slug`), e.g. `barbell-back-squat`."
  );

export const LIBRARY_UNAVAILABLE_MESSAGE = "Library unavailable, try again.";

/**
 * Known Exercises by the slug a read asked for (an old slug keyed to its
 * replacement), from one lookup in the Library.
 */
export type KnownExercises = ReadonlyMap<string, LibraryExerciseSummary>;

/**
 * The instance's Library, for a tool that can't answer without it (a
 * search, `get_exercise`): a bundle that can't load (reported by the
 * Library itself) is the Library tool error.
 */
export const requireLibrary = async (
  ctx: ToolContext
): Promise<InMemoryLibrary> => {
  const answer = await ctx.library.get();

  if (answer.status === "unavailable") {
    throw new ToolError(LIBRARY_UNAVAILABLE_MESSAGE);
  }

  return answer.library;
};

/**
 * What a write's slugs answered once every one is known: their muscle
 * groups, from the new Library, and the Covers to pick from, from the Legacy
 * Library's index (ADR 0022).
 */
export interface CheckedSlugs {
  covers: IndexCover[];
  /** Each known slug's primary muscle groups, keyed by the slug the write sent. */
  muscleGroups: ReadonlyMap<string, readonly string[]>;
}

/**
 * Checks every slug a write carries against the new Library (ADR 0022), its
 * `replaced_slugs` included, before the services open their transaction
 * (ADR 0010), then reads the Covers from the Legacy Library's index: an
 * unknown slug is a `ToolError` naming it, unreported, and a bundle or index
 * that can't load (reported by itself) is the Library tool error. Nothing is
 * written either way. A slug is stored as sent: an old one is rewritten later
 * with every other stored slug.
 */
export const requireKnownSlugs = async (
  ctx: ToolContext,
  slugs: string[]
): Promise<CheckedSlugs> => {
  const library = await requireLibrary(ctx);
  const { known, unknown } = library.checkSlugs(slugs);

  if (unknown.length > 0) {
    throw new ToolError(
      `Unknown exercise_slug(s): ${unknown.join(", ")}. Use list_exercises to look up valid Exercise slugs.`
    );
  }

  // Covers only: the index has no say in which slugs are known
  const index = await ctx.libraryIndex.lookup([]);

  if (index.status === "unavailable") {
    throw new ToolError(LIBRARY_UNAVAILABLE_MESSAGE);
  }

  return {
    covers: index.covers,
    muscleGroups: new Map(
      known.map((exercise) => [exercise.requested_slug, exercise.muscle_groups])
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
      muscleGroups: cover.muscle_groups as LegacyMuscleGroup[],
    })),
    workouts: workouts.map((workout) => ({
      exercises: workout.exercises.map((exercise) => ({
        // SAFETY: as above, pickCovers only compares the groups for equality.
        muscleGroups: (checked.muscleGroups.get(exercise.exercise_slug) ??
          []) as LegacyMuscleGroup[],
      })),
    })),
  });

  return workouts.map((workout, index) => ({
    ...workout,
    cover: picked[index] ?? null,
  }));
};

/**
 * The Exercises a read shows, looked up in the Library after its
 * transaction, an old slug answering its replacement. Never fails the read:
 * with a bundle that can't load (reported by the Library itself), every
 * Exercise gets a name derived from its slug.
 */
export const lookupForRead = async (
  ctx: ToolContext,
  slugs: string[]
): Promise<KnownExercises> => {
  const answer = await ctx.library.get();

  if (answer.status === "unavailable") {
    return new Map();
  }

  return new Map(
    answer.library
      .lookup(slugs)
      .data.map((exercise) => [exercise.requested_slug, exercise])
  );
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
export const named = <T extends WithSlug>(
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
