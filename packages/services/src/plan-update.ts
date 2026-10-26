import { MAX_SETS_PER_EXERCISE } from "@fitme/core/limits";
import {
  plans,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { lockProfileUnits, type ProfileUnits } from "./profile";

/**
 * The Plan Update: the structural changes a finished Workout Session made to
 * its Workout, which the User can save to the Plan ("Update your plan?").
 * Preview and apply, run inside `asUser`.
 *
 * Workout Session Exercises are matched to Workout Exercises by `order`:
 * a slot with only a Workout Exercise was removed, one with only a Workout
 * Session Exercise was added, one whose slugs differ was replaced, and one
 * with the same Exercise may have gained sets. Targets come from the logged
 * sets; nothing never logged is offered.
 */

/** No Plan Update past this many Exercises on either side. */
const MAX_EXERCISES = 50;
/** No Plan Update past this many sets on any one Exercise, on either side. */
const MAX_INPUT_SETS = 100;
/** The rest of a set with no Plan set to take it from. */
const DEFAULT_REST = 90;

interface NamedRef {
  id: string;
  /** A Plan's name may be null; a Workout's never is. */
  name: string | null;
}

/** A set the Plan gets, its targets taken from what the User logged. */
export interface PlanUpdateSet {
  reps: number;
  weight: number;
}

export type PlanUpdateChange =
  | {
      exercise_slug: string;
      kind: "replace_exercise";
      replaced_exercise_slug: string;
      sets: PlanUpdateSet[];
    }
  | { exercise_slug: string; kind: "add_exercise"; sets: PlanUpdateSet[] }
  | { exercise_slug: string; kind: "remove_exercise" }
  | { exercise_slug: string; kind: "add_sets"; sets: PlanUpdateSet[] };

/**
 * The Plan Update of a Workout Session, in both modes: the Plan and Workout
 * it updates (`null` when the Workout is gone or its Plan soft-deleted), the
 * changes in Workout order (none for an open, unmatchable or already applied
 * Workout Session), and the unit its weights are stored in.
 */
export interface PlanUpdate {
  changes: PlanUpdateChange[];
  plan: NamedRef | null;
  weight_unit: ProfileUnits["weight"];
  workout: NamedRef | null;
}

/** A set with its rest, which the apply writes and the answer leaves out. */
interface RestedSet extends PlanUpdateSet {
  rest: number;
}

/** A change with the row it applies to and the rests of its sets. */
type PlannedChange =
  | {
      exerciseSlug: string;
      kind: "replace_exercise";
      replacedExerciseSlug: string;
      sets: RestedSet[];
      workoutExerciseId: string;
    }
  | { exerciseSlug: string; kind: "add_exercise"; sets: RestedSet[] }
  | { exerciseSlug: string; kind: "remove_exercise"; workoutExerciseId: string }
  | {
      exerciseSlug: string;
      kind: "add_sets";
      sets: RestedSet[];
      workoutExerciseId: string;
    };

interface SessionSet {
  repsCompleted: number | null;
  repsRecommended: number | null;
  weightCompleted: string | null;
}

interface Slot {
  /** Its sets' rests, by position: one per set, since a Plan set has one. */
  planExercise?: { id: string; rests: number[]; slug: string };
  sessionExercise?: { sets: SessionSet[]; slug: string };
}

/**
 * Whether slots can't be matched: a repeated `order` on either side, or
 * either side past the caps, so the work per call stays bounded. Each check
 * is one indexed count; no row is loaded.
 */
const isUnmatchable = async (
  tx: Transaction,
  sessionId: string,
  workoutId: string
) => {
  const {
    rows: [result],
  } = await tx.execute<{ unmatchable: boolean }>(sql`
    select (
      exists (
        select 1 from ${workoutSessionExercises}
        where ${workoutSessionExercises.workoutSessionId} = ${sessionId}
        group by ${workoutSessionExercises.order}
        having count(*) > 1
      ) or exists (
        select 1 from ${workoutExercises}
        where ${workoutExercises.workoutId} = ${workoutId}
        group by ${workoutExercises.order}
        having count(*) > 1
      ) or (
        select count(*) from ${workoutSessionExercises}
        where ${workoutSessionExercises.workoutSessionId} = ${sessionId}
      ) > ${MAX_EXERCISES} or (
        select count(*) from ${workoutExercises}
        where ${workoutExercises.workoutId} = ${workoutId}
      ) > ${MAX_EXERCISES} or exists (
        select 1
        from ${workoutSessionExercises}
        join ${workoutSessionExerciseSets}
          on ${workoutSessionExerciseSets.workoutSessionExerciseId} = ${workoutSessionExercises.id}
        where ${workoutSessionExercises.workoutSessionId} = ${sessionId}
        group by ${workoutSessionExercises.id}
        having count(*) > ${MAX_INPUT_SETS}
      ) or exists (
        select 1
        from ${workoutExercises}
        join ${workoutExerciseSets}
          on ${workoutExerciseSets.workoutExerciseId} = ${workoutExercises.id}
        where ${workoutExercises.workoutId} = ${workoutId}
        group by ${workoutExercises.id}
        having count(*) > ${MAX_INPUT_SETS}
      )
    ) as unmatchable
  `);
  return Boolean(result?.unmatchable);
};

/** Both sides' Exercises and sets, by `order` (then id), as slots by `order`. */
const loadSlots = async (
  tx: Transaction,
  sessionId: string,
  workoutId: string
): Promise<Slot[]> => {
  const sessionRows = await tx
    .select({
      id: workoutSessionExercises.id,
      order: workoutSessionExercises.order,
      repsCompleted: workoutSessionExerciseSets.repsCompleted,
      repsRecommended: workoutSessionExerciseSets.repsRecommended,
      setId: workoutSessionExerciseSets.id,
      slug: workoutSessionExercises.exerciseSlug,
      weightCompleted: workoutSessionExerciseSets.weightCompleted,
    })
    .from(workoutSessionExercises)
    .leftJoin(
      workoutSessionExerciseSets,
      eq(
        workoutSessionExerciseSets.workoutSessionExerciseId,
        workoutSessionExercises.id
      )
    )
    .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
    .orderBy(
      asc(workoutSessionExercises.order),
      asc(workoutSessionExercises.id),
      asc(workoutSessionExerciseSets.order),
      asc(workoutSessionExerciseSets.id)
    );
  const planRows = await tx
    .select({
      id: workoutExercises.id,
      order: workoutExercises.order,
      rest: workoutExerciseSets.restRecommended,
      setId: workoutExerciseSets.id,
      slug: workoutExercises.exerciseSlug,
    })
    .from(workoutExercises)
    .leftJoin(
      workoutExerciseSets,
      eq(workoutExerciseSets.workoutExerciseId, workoutExercises.id)
    )
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(
      asc(workoutExercises.order),
      asc(workoutExercises.id),
      asc(workoutExerciseSets.order),
      asc(workoutExerciseSets.id)
    );

  // Orders are unique on each side here (isUnmatchable), so one per slot
  const slots = new Map<number, Slot>();
  const slotAt = (order: number) => {
    let slot = slots.get(order);
    if (!slot) {
      slot = {};
      slots.set(order, slot);
    }
    return slot;
  };
  for (const row of sessionRows) {
    const slot = slotAt(row.order);
    slot.sessionExercise ??= { sets: [], slug: row.slug };
    if (row.setId) {
      slot.sessionExercise.sets.push({
        repsCompleted: row.repsCompleted,
        repsRecommended: row.repsRecommended,
        weightCompleted: row.weightCompleted,
      });
    }
  }
  for (const row of planRows) {
    const slot = slotAt(row.order);
    slot.planExercise ??= { id: row.id, rests: [], slug: row.slug };
    if (row.rest !== null) {
      slot.planExercise.rests.push(row.rest);
    }
  }
  return [...slots.entries()].sort(([a], [b]) => a - b).map(([, slot]) => slot);
};

type LoggedSet = SessionSet & { repsCompleted: number };

const isLogged = (set: SessionSet): set is LoggedSet =>
  set.repsCompleted !== null;

const weightOf = (set: SessionSet) => Number(set.weightCompleted ?? 0);

/** The logged sets of an added Exercise, rest 90 s; none logged, `null`. */
const addedSets = (sets: SessionSet[]): RestedSet[] | null => {
  const logged = sets
    .filter(isLogged)
    .slice(0, MAX_SETS_PER_EXERCISE)
    .map((set) => ({
      reps: set.repsCompleted,
      rest: DEFAULT_REST,
      weight: weightOf(set),
    }));
  return logged.length > 0 ? logged : null;
};

/**
 * A replacement's sets: one per Workout Session set, logged values as targets
 * (an unlogged set takes the last logged set's), each with the rest of the
 * Plan set at its position (past the Plan's sets, its last one). None logged,
 * `null`.
 */
const replacementSets = (
  sets: SessionSet[],
  planRests: number[]
): RestedSet[] | null => {
  const lastLogged = sets.filter(isLogged).at(-1);
  if (!lastLogged) {
    return null;
  }
  const lastRest = planRests.at(-1);
  return sets.slice(0, MAX_SETS_PER_EXERCISE).map((set, index) => {
    const logged = set.repsCompleted === null ? lastLogged : set;
    return {
      reps: logged.repsCompleted as number,
      rest: planRests[index] ?? lastRest ?? DEFAULT_REST,
      weight: weightOf(logged),
    };
  });
};

/**
 * The same Exercise's sets created during the Workout Session and logged,
 * with the rest of the Plan's last set, up to 20 sets in all. A created set
 * carries no `reps_recommended`, unlike a copied one, but replacing the
 * Exercise in the app zeroes every set's targets, so after switching back the
 * marker is gone; the session can't delete sets, so a set past the Plan's
 * count was created too. None, `null`.
 */
const extraSets = (
  sets: SessionSet[],
  planRests: number[]
): RestedSet[] | null => {
  const planSetCount = planRests.length;
  const rest = planRests.at(-1) ?? DEFAULT_REST;
  const extra = sets
    .filter(
      (set, index) => set.repsRecommended === null || index + 1 > planSetCount
    )
    .filter(isLogged)
    .slice(0, Math.max(MAX_SETS_PER_EXERCISE - planSetCount, 0))
    .map((set) => ({
      reps: set.repsCompleted,
      rest,
      weight: weightOf(set),
    }));
  return extra.length > 0 ? extra : null;
};

const planChange = ({
  planExercise,
  sessionExercise,
}: Slot): PlannedChange | null => {
  if (planExercise && !sessionExercise) {
    return {
      exerciseSlug: planExercise.slug,
      kind: "remove_exercise",
      workoutExerciseId: planExercise.id,
    };
  }
  if (sessionExercise && !planExercise) {
    const sets = addedSets(sessionExercise.sets);
    return (
      sets && {
        exerciseSlug: sessionExercise.slug,
        kind: "add_exercise",
        sets,
      }
    );
  }
  if (!(planExercise && sessionExercise)) {
    return null;
  }
  if (sessionExercise.slug !== planExercise.slug) {
    const sets = replacementSets(sessionExercise.sets, planExercise.rests);
    return (
      sets && {
        exerciseSlug: sessionExercise.slug,
        kind: "replace_exercise",
        replacedExerciseSlug: planExercise.slug,
        sets,
        workoutExerciseId: planExercise.id,
      }
    );
  }
  const sets = extraSets(sessionExercise.sets, planExercise.rests);
  return (
    sets && {
      exerciseSlug: planExercise.slug,
      kind: "add_sets",
      sets,
      workoutExerciseId: planExercise.id,
    }
  );
};

const insertSets = (
  tx: Transaction,
  workoutExerciseId: string,
  firstOrder: number,
  sets: RestedSet[]
) =>
  tx.insert(workoutExerciseSets).values(
    sets.map((set, index) => ({
      order: firstOrder + index,
      repsRecommended: set.reps,
      restRecommended: set.rest,
      weightRecommended: String(set.weight),
      workoutExerciseId,
    }))
  );

/**
 * Writes the changes in this order: replacements and added sets on their
 * rows, then removals with the remaining Exercises renumbered from 1, then
 * added Exercises appended; then stamps the Workout Session.
 */
const applyChanges = async (
  tx: Transaction,
  sessionId: string,
  workoutId: string,
  changes: PlannedChange[]
) => {
  for (const change of changes) {
    if (change.kind === "replace_exercise") {
      // biome-ignore lint/performance/noAwaitInLoops: one statement at a time on tx, in order
      await tx
        .update(workoutExercises)
        .set({ exerciseSlug: change.exerciseSlug, updatedAt: sql`now()` })
        .where(eq(workoutExercises.id, change.workoutExerciseId));
      await tx
        .delete(workoutExerciseSets)
        .where(
          eq(workoutExerciseSets.workoutExerciseId, change.workoutExerciseId)
        );
      await insertSets(tx, change.workoutExerciseId, 1, change.sets);
    } else if (change.kind === "add_sets") {
      const [last] = await tx
        .select({ order: max(workoutExerciseSets.order) })
        .from(workoutExerciseSets)
        .where(
          eq(workoutExerciseSets.workoutExerciseId, change.workoutExerciseId)
        );
      await insertSets(
        tx,
        change.workoutExerciseId,
        (last?.order ?? 0) + 1,
        change.sets
      );
    }
  }

  const removed = changes.flatMap((change) =>
    change.kind === "remove_exercise" ? [change.workoutExerciseId] : []
  );
  if (removed.length > 0) {
    await tx
      .delete(workoutExercises)
      .where(inArray(workoutExercises.id, removed));
  }
  await tx.execute(sql`
    with ranked as (
      select
        ${workoutExercises.id} as id,
        row_number() over (
          order by ${workoutExercises.order}, ${workoutExercises.createdAt}, ${workoutExercises.id}
        ) as new_order
      from ${workoutExercises}
      where ${workoutExercises.workoutId} = ${workoutId}
    )
    update ${workoutExercises}
    set "order" = ranked.new_order
    from ranked
    where ${workoutExercises.id} = ranked.id
      and ${workoutExercises.order} <> ranked.new_order
  `);

  for (const change of changes) {
    if (change.kind !== "add_exercise") {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: each appends after the last
    const [last] = await tx
      .select({ order: max(workoutExercises.order) })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId));
    const [added] = await tx
      .insert(workoutExercises)
      .values({
        exerciseSlug: change.exerciseSlug,
        order: (last?.order ?? 0) + 1,
        workoutId,
      })
      .returning({ id: workoutExercises.id });
    await insertSets(tx, added.id, 1, change.sets);
  }

  await tx
    .update(workoutSessions)
    .set({ planChangesAppliedAt: sql`now()` })
    .where(eq(workoutSessions.id, sessionId));
};

/** A change as the service answers it: slugs and `{ reps, weight }` sets, no rows or rests. */
const toAnswer = (change: PlannedChange): PlanUpdateChange => {
  const sets = (rested: RestedSet[]) =>
    rested.map(({ reps, weight }) => ({ reps, weight }));
  switch (change.kind) {
    case "replace_exercise":
      return {
        exercise_slug: change.exerciseSlug,
        kind: change.kind,
        replaced_exercise_slug: change.replacedExerciseSlug,
        sets: sets(change.sets),
      };
    case "remove_exercise":
      return { exercise_slug: change.exerciseSlug, kind: change.kind };
    default:
      return {
        exercise_slug: change.exerciseSlug,
        kind: change.kind,
        sets: sets(change.sets),
      };
  }
};

/**
 * The Plan Update of one of the User's Workout Sessions, applied in `tx` when
 * `apply` is set, or `null` when the User has no such Workout Session.
 *
 * Locks in preview too: ROW EXCLUSIVE on `workout_sessions`
 * and the Workout tables in `deleteUserData`'s order (so a call queues behind
 * an account deletion before it holds any row the deletion's cascade needs),
 * then the Profile row (`lockProfileUnits`, for the unit), the Plan row, the
 * Workout row, its Workout Exercise rows and the Workout Session row
 * (`finishWorkoutSession`'s order). Two concurrent applies serialize on them,
 * and the second sees `plan_changes_applied_at` and answers no changes.
 */
const planUpdate = async (
  tx: Transaction,
  userId: string,
  sessionId: string,
  { apply }: { apply: boolean }
): Promise<PlanUpdate | null> => {
  await tx.execute(sql`
    lock table ${workoutSessions}, ${workouts}, ${workoutExercises},
      ${workoutExerciseSets}
    in row exclusive mode
  `);
  const units = await lockProfileUnits(tx, userId);
  const weightUnit = units?.weight ?? "kg";
  const ofUser = and(
    eq(workoutSessions.id, sessionId),
    eq(workoutSessions.userId, userId)
  );

  const [sessionWorkout] = await tx
    .select({ workoutId: workoutSessions.workoutId })
    .from(workoutSessions)
    .where(ofUser);
  if (!sessionWorkout) {
    return null;
  }

  let workout:
    | { id: string; name: string; planId: string; planName: string | null }
    | undefined;
  if (sessionWorkout.workoutId) {
    await tx
      .select({ id: plans.id })
      .from(plans)
      .where(
        and(
          inArray(
            plans.id,
            tx
              .select({ planId: workouts.planId })
              .from(workouts)
              .where(eq(workouts.id, sessionWorkout.workoutId))
          ),
          eq(plans.userId, userId)
        )
      )
      .for("no key update");
    [workout] = await tx
      .select({
        id: workouts.id,
        name: workouts.name,
        planId: plans.id,
        planName: plans.name,
      })
      .from(workouts)
      .innerJoin(plans, eq(plans.id, workouts.planId))
      .where(
        and(
          eq(workouts.id, sessionWorkout.workoutId),
          eq(plans.userId, userId),
          isNull(plans.deletedAt)
        )
      )
      .for("no key update", { of: workouts });
    if (workout) {
      await tx
        .select({ id: workoutExercises.id })
        .from(workoutExercises)
        .where(eq(workoutExercises.workoutId, workout.id))
        .orderBy(asc(workoutExercises.id))
        .for("no key update");
    }
  }

  const [session] = await tx
    .select({
      appliedAt: workoutSessions.planChangesAppliedAt,
      finishedAt: workoutSessions.finishedAt,
      workoutId: workoutSessions.workoutId,
    })
    .from(workoutSessions)
    .where(ofUser)
    .for("no key update");
  if (!session) {
    return null;
  }

  // No Workout (deleted, or its Plan soft-deleted), or the Workout Session
  // moved off it while we waited for the lock
  if (!workout || session.workoutId !== workout.id) {
    return { changes: [], plan: null, weight_unit: weightUnit, workout: null };
  }

  let changes: PlannedChange[] = [];
  if (
    session.finishedAt !== null &&
    session.appliedAt === null &&
    !(await isUnmatchable(tx, sessionId, workout.id))
  ) {
    const slots = await loadSlots(tx, sessionId, workout.id);
    changes = slots.flatMap((slot) => planChange(slot) ?? []);
    if (apply) {
      await applyChanges(tx, sessionId, workout.id, changes);
    }
  }

  return {
    changes: changes.map(toAnswer),
    plan: { id: workout.planId, name: workout.planName },
    weight_unit: weightUnit,
    workout: { id: workout.id, name: workout.name },
  };
};

/**
 * The Plan Update of one of the User's Workout Sessions, without writing
 * anything; `null` when the User has no such Workout Session.
 */
export const previewPlanUpdate = (
  tx: Transaction,
  userId: string,
  sessionId: string
) => planUpdate(tx, userId, sessionId, { apply: false });

/**
 * Applies the Plan Update of one of the User's Workout Sessions and answers
 * what it applied; `null` when the User has no such Workout Session. Once
 * applied, both modes answer no changes, so a repeat writes nothing.
 */
export const applyPlanUpdate = (
  tx: Transaction,
  userId: string,
  sessionId: string
) => planUpdate(tx, userId, sessionId, { apply: true });
