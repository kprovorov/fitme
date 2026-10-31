import {
  type PersonalRecordKind,
  personalRecordFor,
  RECORD_WEIGHT_TOLERANCE,
  type RecordSet,
} from "@fitme/core/personal-records";
import {
  personalRecordInitializations,
  personalRecords,
  type Transaction,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  ne,
  sql,
} from "drizzle-orm";
import { lockProfileUnits } from "./profile";

/** After the Profile lock, before Plan/session locks; transaction-local. */
export const lockPersonalRecordHistory = (tx: Transaction, userId: string) =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`personal-records:${userId}`}, 0))`
  );

/**
 * Explicit per-User initialization entry point, inside asUser. Atomic: an
 * interruption rolls back every award and completion, so retry starts safely.
 * No pagination, no inferred units/goals, and no automatic production caller.
 */
export const initializePersonalRecords = async (
  tx: Transaction,
  userId: string
): Promise<{ alreadyInitialized: boolean }> => {
  // As in finish, queue behind account deletion before taking any row lock.
  await tx.execute(sql`lock table ${workoutSessions} in row exclusive mode`);
  await lockProfileUnits(tx, userId);
  await lockPersonalRecordHistory(tx, userId);
  const [completed] = await tx
    .select({ userId: personalRecordInitializations.userId })
    .from(personalRecordInitializations)
    .where(eq(personalRecordInitializations.userId, userId));
  if (completed) {
    return { alreadyInitialized: true };
  }
  const sessions = await tx
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        isNotNull(workoutSessions.finishedAt)
      )
    )
    .orderBy(
      asc(workoutSessions.finishedAt),
      asc(workoutSessions.startedAt),
      asc(workoutSessions.id)
    );
  for (const session of sessions) {
    // biome-ignore lint/performance/noAwaitInLoops: one transaction, chronological replay
    await awardPersonalRecords(tx, userId, session.id, true);
  }
  await tx.insert(personalRecordInitializations).values({ userId });
  return { alreadyInitialized: false };
};

/** A Personal record a Workout Session earned; its weight in the User's unit. */
export interface WorkoutSessionPersonalRecord {
  exercise_slug: string;
  kind: PersonalRecordKind;
  reps: number;
  weight: number;
}

/**
 * The Personal records of the Workout Session `workout_sessions.id` refers to
 * in the enclosing query, as a JSON array (empty for none), by Exercise slug.
 */
export const personalRecordsOfSession = sql<WorkoutSessionPersonalRecord[]>`(
  select coalesce(
    json_agg(
      json_build_object(
        'exercise_slug', ${personalRecords.exerciseSlug},
        'kind', ${personalRecords.kind},
        'reps', ${personalRecords.reps},
        'weight', ${personalRecords.weight}::float8
      )
      order by ${personalRecords.exerciseSlug}
    ),
    '[]'::json
  )
  from ${personalRecords}
  where ${personalRecords.workoutSessionId} = ${workoutSessions.id}
)`;

const toNumber = (value: string | null) =>
  value === null ? null : Number(value);

/**
 * Awards the Personal records Workout Session `sessionId` of `userId` earned,
 * in `tx` (from `asUser`, after finish has claimed it, or during historical
 * initialization): per Exercise, its best usable set against the best usable
 * result of that Exercise in the User's other finished Workout Sessions,
 * restricted to earlier finish order for chronological replay, whatever the
 * Plan (`personalRecordFor`, ADR 0015). Weights compare as
 * stored, all in the User's unit, which the caller has share-locked.
 * A repeat writes nothing: one record per Exercise per Workout Session.
 */
export const awardPersonalRecords = async (
  tx: Transaction,
  userId: string,
  sessionId: string,
  chronological = false
): Promise<void> => {
  const sets = await tx
    .select({
      exerciseSlug: workoutSessionExercises.exerciseSlug,
      repsCompleted: workoutSessionExerciseSets.repsCompleted,
      weightCompleted: workoutSessionExerciseSets.weightCompleted,
    })
    .from(workoutSessionExerciseSets)
    .innerJoin(
      workoutSessionExercises,
      eq(
        workoutSessionExercises.id,
        workoutSessionExerciseSets.workoutSessionExerciseId
      )
    )
    .where(eq(workoutSessionExercises.workoutSessionId, sessionId));

  const setsBySlug = new Map<string, RecordSet[]>();
  for (const set of sets) {
    const slugSets = setsBySlug.get(set.exerciseSlug) ?? [];
    slugSets.push({
      reps_completed: set.repsCompleted,
      weight_completed: toNumber(set.weightCompleted),
    });
    setsBySlug.set(set.exerciseSlug, slugSets);
  }
  if (setsBySlug.size === 0) {
    return;
  }

  // Per Exercise, the highest usable weight with the most reps at it, over
  // the User's other finished Workout Sessions. Loads within the conversion
  // rounding step share their highest rep count; retain the absolute maximum
  // weight as the comparison anchor so the tolerance never accumulates.
  const earlierResults = tx
    .select({
      exerciseSlug: workoutSessionExercises.exerciseSlug,
      highestWeight:
        sql<string>`max(${workoutSessionExerciseSets.weightCompleted}) over (partition by ${workoutSessionExercises.exerciseSlug})`.as(
          "highest_weight"
        ),
      reps: workoutSessionExerciseSets.repsCompleted,
      weight: workoutSessionExerciseSets.weightCompleted,
    })
    .from(workoutSessionExerciseSets)
    .innerJoin(
      workoutSessionExercises,
      eq(
        workoutSessionExercises.id,
        workoutSessionExerciseSets.workoutSessionExerciseId
      )
    )
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
    )
    .where(
      and(
        eq(workoutSessions.userId, userId),
        ne(workoutSessions.id, sessionId),
        isNotNull(workoutSessions.finishedAt),
        // Compare database timestamps directly: JS would lose microseconds.
        // Stable tie-breakers also make equal legacy finish times repeatable.
        chronological
          ? sql`(${workoutSessions.finishedAt}, ${workoutSessions.startedAt}, ${workoutSessions.id}) < (
          select target.finished_at, target.started_at, target.id
          from public.workout_sessions target where target.id = ${sessionId}
        )`
          : undefined,
        inArray(workoutSessionExercises.exerciseSlug, [...setsBySlug.keys()]),
        gt(workoutSessionExerciseSets.repsCompleted, 0),
        isNotNull(workoutSessionExerciseSets.weightCompleted)
      )
    )
    .as("earlier_results");
  const earlier = await tx
    .selectDistinctOn([earlierResults.exerciseSlug], {
      exerciseSlug: earlierResults.exerciseSlug,
      reps: earlierResults.reps,
      weight: earlierResults.highestWeight,
    })
    .from(earlierResults)
    .where(sql`${earlierResults.highestWeight} - ${earlierResults.weight} < ${RECORD_WEIGHT_TOLERANCE}
      and (${earlierResults.highestWeight} = 0) = (${earlierResults.weight} = 0)`)
    .orderBy(
      asc(earlierResults.exerciseSlug),
      desc(earlierResults.reps),
      desc(earlierResults.weight)
    );
  const earlierBySlug = new Map(
    earlier.map(({ exerciseSlug, reps, weight }) => [
      exerciseSlug,
      { reps: reps ?? 0, weight: Number(weight) },
    ])
  );

  const awards = [...setsBySlug].flatMap(([exerciseSlug, slugSets]) => {
    const record = personalRecordFor(
      earlierBySlug.get(exerciseSlug) ?? null,
      slugSets
    );
    return record
      ? [
          {
            exerciseSlug,
            kind: record.kind,
            reps: record.reps,
            userId,
            weight: String(record.weight),
            workoutSessionId: sessionId,
          },
        ]
      : [];
  });
  if (awards.length > 0) {
    await tx.insert(personalRecords).values(awards).onConflictDoNothing();
  }
};
