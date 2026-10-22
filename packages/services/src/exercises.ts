import type { MuscleGroup } from "@fitme/core/models";
import {
  exercises,
  plans,
  type Transaction,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { jsonTimestamp } from "./json-timestamp";

const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

/** Matches `search` anywhere in the name, treating `%` and `_` literally. */
const containsPattern = (search: string) =>
  `%${search.replace(LIKE_SPECIAL_CHARACTERS, "\\$&")}%`;

/** A library Exercise as `list_exercises` shows it. */
export interface ExerciseSummary {
  description: string | null;
  id: string;
  muscle_groups: unknown;
  name: string;
  slug: string;
}

export interface ExerciseQuery {
  limit: number;
  /** Only Exercises whose `muscle_groups` include this one. */
  muscleGroup?: MuscleGroup;
  offset: number;
  /** Case-insensitive substring of the name. */
  search?: string;
}

export interface ExercisePage {
  exercises: ExerciseSummary[];
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}

/** An empty page has no row to carry the total: count it on its own. */
const countMatches = async (tx: Transaction, filters: SQL | undefined) => {
  const [counted] = await tx
    .select({ total: count() })
    .from(exercises)
    .where(filters);
  return counted?.total ?? 0;
};

/**
 * One page of the Exercise library, alphabetical (ties by id), plus the total
 * matching the filters. An offset past the end is an empty page, not an error.
 */
export const listExercises = async (
  tx: Transaction,
  { limit, muscleGroup, offset, search }: ExerciseQuery
): Promise<ExercisePage> => {
  const filters = and(
    search ? ilike(exercises.name, containsPattern(search)) : undefined,
    muscleGroup
      ? sql`${exercises.muscleGroups} @> ${JSON.stringify([muscleGroup])}::jsonb`
      : undefined
  );
  // the total rides along on every row, so page and total share a snapshot
  const matches = await tx
    .select({
      description: exercises.description,
      id: exercises.id,
      muscle_groups: exercises.muscleGroups,
      name: exercises.name,
      slug: exercises.slug,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(exercises)
    .where(filters)
    .orderBy(asc(exercises.name), asc(exercises.id))
    .limit(limit)
    .offset(offset);
  const rows = matches.map(({ total: _, ...row }) => row);
  const total = matches[0]?.total ?? (await countMatches(tx, filters));
  return {
    exercises: rows,
    hasMore: offset + rows.length < total,
    limit,
    offset,
    total,
  };
};

/** A library Exercise with every detail. */
export interface Exercise extends ExerciseSummary {
  created_at: string | null;
  instructions: string | null;
  thumbnail_url: string | null;
  updated_at: string | null;
  video_url: string | null;
}

/** One Exercise from the library, or `null` when there's none with that id. */
export const getExercise = async (
  tx: Transaction,
  exerciseId: string
): Promise<Exercise | null> => {
  const [exercise] = await tx
    .select({
      created_at: jsonTimestamp(exercises.createdAt),
      description: exercises.description,
      id: exercises.id,
      instructions: exercises.instructions,
      muscle_groups: exercises.muscleGroups,
      name: exercises.name,
      slug: exercises.slug,
      thumbnail_url: exercises.thumbnailUrl,
      updated_at: jsonTimestamp(exercises.updatedAt),
      video_url: exercises.videoUrl,
    })
    .from(exercises)
    .where(eq(exercises.id, exerciseId));
  return exercise ?? null;
};

export interface ExerciseHistorySet {
  id: string;
  logged_at: string | null;
  order: number;
  reps_completed: number | null;
  weight_completed: number;
}

/** One time the Exercise appeared in one of the User's Workout Sessions. */
export interface ExerciseHistoryEntry {
  finished_at: string | null;
  plan: { id: string; name: string | null } | null;
  session_exercise_id: string;
  session_id: string;
  /** Only sets with a logged weight, by `order`. */
  sets: ExerciseHistorySet[];
  started_at: string | null;
  workout: { id: string; name: string } | null;
}

/**
 * The Exercise by its Exercise slug, or by its legacy uuid until MCP moves to
 * slugs (the contract step drops `exerciseId`).
 */
export type ExerciseHistoryQuery = (
  | { exerciseId?: undefined; exerciseSlug: string }
  | { exerciseId: string; exerciseSlug?: undefined }
) & {
  /** Maximum number of entries. */
  limit: number;
};

const hasWeight = isNotNull(workoutSessionExerciseSets.weightCompleted);

/**
 * The User's logged sets for one Exercise, newest entry first, in `tx` (from
 * `asUser`). Entries without a set with a logged weight are skipped. Only the
 * User's own Workout Sessions count; RLS hides everyone else's too. One
 * statement, so entries and their sets come from one snapshot.
 */
export const getExerciseHistory = async (
  tx: Transaction,
  userId: string,
  { exerciseId, exerciseSlug, limit }: ExerciseHistoryQuery
): Promise<ExerciseHistoryEntry[]> => {
  const isExercise =
    exerciseSlug === undefined
      ? eq(workoutSessionExercises.exerciseId, exerciseId)
      : eq(workoutSessionExercises.exerciseSlug, exerciseSlug);
  const newest = desc(workoutSessionExercises.createdAt);
  const latestEntries = tx
    .select({ id: workoutSessionExercises.id })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(
      and(
        isExercise,
        eq(workoutSessions.userId, userId),
        exists(
          tx
            .select({ one: sql`1` })
            .from(workoutSessionExerciseSets)
            .where(
              and(
                eq(
                  workoutSessionExerciseSets.workoutSessionExerciseId,
                  workoutSessionExercises.id
                ),
                hasWeight
              )
            )
        )
      )
    )
    .orderBy(newest, desc(workoutSessionExercises.id))
    .limit(limit);

  const rows = await tx
    .select({
      entry: {
        finished_at: jsonTimestamp(workoutSessions.finishedAt),
        session_exercise_id: workoutSessionExercises.id,
        session_id: workoutSessions.id,
        started_at: jsonTimestamp(workoutSessions.startedAt),
      },
      plan: { id: plans.id, name: plans.name },
      set: {
        id: workoutSessionExerciseSets.id,
        logged_at: jsonTimestamp(workoutSessionExerciseSets.loggedAt),
        order: workoutSessionExerciseSets.order,
        reps_completed: workoutSessionExerciseSets.repsCompleted,
        weight_completed: workoutSessionExerciseSets.weightCompleted,
      },
      workout: { id: workouts.id, name: workouts.name },
    })
    .from(workoutSessionExercises)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .innerJoin(
      workoutSessionExerciseSets,
      and(
        eq(
          workoutSessionExerciseSets.workoutSessionExerciseId,
          workoutSessionExercises.id
        ),
        hasWeight
      )
    )
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(plans, eq(plans.id, workoutSessions.planId))
    .where(inArray(workoutSessionExercises.id, latestEntries))
    .orderBy(
      newest,
      desc(workoutSessionExercises.id),
      asc(workoutSessionExerciseSets.order),
      asc(workoutSessionExerciseSets.id)
    );

  const entries = new Map<string, ExerciseHistoryEntry>();
  for (const { entry, plan, set, workout } of rows) {
    const current = entries.get(entry.session_exercise_id) ?? {
      ...entry,
      plan,
      sets: [],
      workout,
    };
    // numeric columns arrive as strings; PostgREST returned numbers
    current.sets.push({
      ...set,
      weight_completed: Number(set.weight_completed),
    });
    entries.set(entry.session_exercise_id, current);
  }
  return [...entries.values()];
};
