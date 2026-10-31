import {
  type PersonalRecordKind,
  personalRecordFor,
  RECORD_WEIGHT_TOLERANCE,
  type RecordSet,
} from "@fitme/core/personal-records";
import {
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
 * in `tx` (from `asUser`, inside `finishWorkoutSession`, once it has claimed
 * the session): per Exercise, its best usable set against the best usable
 * result of that Exercise in every other finished Workout Session of the
 * User, whatever its Plan (`personalRecordFor`, ADR 0015). Weights compare as
 * stored, all in the User's unit, which the caller has share-locked.
 * A repeat writes nothing: one record per Exercise per Workout Session.
 */
export const awardPersonalRecords = async (
  tx: Transaction,
  userId: string,
  sessionId: string
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
