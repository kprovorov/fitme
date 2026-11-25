import { MAX_SETS_PER_EXERCISE } from "@fitme/core/limits";
import {
  plans,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { and, asc, eq, inArray, isNull, max, sql } from "drizzle-orm";

import { lockProfileUnits } from "./profile";
import type { ProfileUnits } from "./profile";

/**
 * The Plan Update: the structural changes a finished Workout Session made to
 * its Workout, which the User can save to the Plan ("Update your plan?").
 * Preview and apply, run inside `asUser`.
 *
 * Workout Session Exercises are matched to Workout Exercises by `order`:
 * a slot with only a Workout Exercise was removed, one with only a Workout
 * Session Exercise was added, one whose slugs differ was replaced, and one
 * with the same Exercise may have gained or lost sets. Its sets are matched by
 * `order` too, which a removal leaves alone (ADR 0023). Targets come from the
 * logged sets; nothing never logged is offered.
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

/** The Workout a Plan Update changes, with its Cover id (ADR 0014). */
interface WorkoutRef extends NamedRef {
  cover: string | null;
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

/** The Plan sets of an Exercise that go, with their targets. */
export interface PlanUpdateSetRemoval {
  exercise_slug: string;
  sets: PlanUpdateSet[];
}

export interface PlanUpdateOptions {
  /** Answer, and on apply remove, the Plan sets the User removed. */
  includeSetRemovals?: boolean;
}

/**
 * The Plan Update of a Workout Session, in both modes: the Plan and Workout
 * it updates (`null` when the Workout is gone or its Plan soft-deleted), the
 * changes in Workout order (none for an open, unmatchable or already applied
 * Workout Session), the set removals in the same order (only with
 * `includeSetRemovals`), and the unit its weights are stored in.
 */
export interface PlanUpdate {
  changes: PlanUpdateChange[];
  plan: NamedRef | null;
  set_removals?: PlanUpdateSetRemoval[];
  weight_unit: ProfileUnits["weight"];
  workout: WorkoutRef | null;
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

/** The Plan sets of one Workout Exercise that go. */
interface PlannedSetRemoval {
  exerciseSlug: string;
  sets: PlanSet[];
  workoutExerciseId: string;
}

interface PlanSet extends RestedSet {
  id: string;
  order: number;
}

interface SessionSet {
  order: number;
  repsCompleted: number | null;
  repsRecommended: number | null;
  weightCompleted: string | null;
}

interface Slot {
  planExercise?: { id: string; sets: PlanSet[]; slug: string };
  sessionExercise?: { sets: SessionSet[]; slug: string };
}

/** A transaction has one connection; each operation must finish before the next. */
const inSequence = async <T>(
  values: Iterable<T>,
  visit: (value: T) => Promise<void>
) => {
  const iterator = values[Symbol.iterator]();

  const visitNext = async (): Promise<void> => {
    const entry = iterator.next();

    if (entry.done === true) {
      return;
    }

    await visit(entry.value);
    await visitNext();
  };

  await visitNext();
};

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

  return result?.unmatchable ?? false;
};

/** Both sides' Exercises and sets, by `order` (then id), as slots by `order`. */
const loadSlots = async (
  tx: Transaction,
  sessionId: string,
  workoutId: string
): Promise<Slot[]> => {
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

  await inSequence(
    [
      async () => {
        const sessionRows = await tx
          .select({
            id: workoutSessionExercises.id,
            order: workoutSessionExercises.order,
            repsCompleted: workoutSessionExerciseSets.repsCompleted,
            repsRecommended: workoutSessionExerciseSets.repsRecommended,
            setId: workoutSessionExerciseSets.id,
            setOrder: workoutSessionExerciseSets.order,
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

        for (const row of sessionRows) {
          const slot = slotAt(row.order);
          slot.sessionExercise ??= { sets: [], slug: row.slug };

          if (row.setId !== null && row.setOrder !== null) {
            slot.sessionExercise.sets.push({
              order: row.setOrder,
              repsCompleted: row.repsCompleted,
              repsRecommended: row.repsRecommended,
              weightCompleted: row.weightCompleted,
            });
          }
        }
      },
      async () => {
        const planRows = await tx
          .select({
            id: workoutExercises.id,
            order: workoutExercises.order,
            set: {
              id: workoutExerciseSets.id,
              order: workoutExerciseSets.order,
              reps: workoutExerciseSets.repsRecommended,
              rest: workoutExerciseSets.restRecommended,
              weight: workoutExerciseSets.weightRecommended,
            },
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

        for (const row of planRows) {
          const slot = slotAt(row.order);
          slot.planExercise ??= { id: row.id, sets: [], slug: row.slug };

          if (row.set !== null) {
            slot.planExercise.sets.push({
              ...row.set,
              weight: Number(row.set.weight),
            });
          }
        }
      },
    ],
    async (load) => {
      await load();
    }
  );

  return [...slots.entries()]
    .toSorted(([a], [b]) => a - b)
    .map(([, slot]) => slot);
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
  planSets: PlanSet[]
): RestedSet[] | null => {
  const lastLogged = sets.findLast(isLogged);

  if (!lastLogged) {
    return null;
  }

  const lastRest = planSets.at(-1)?.rest;

  return sets.slice(0, MAX_SETS_PER_EXERCISE).map((set, index) => {
    const logged = isLogged(set) ? set : lastLogged;

    return {
      reps: logged.repsCompleted,
      rest: planSets[index]?.rest ?? lastRest ?? DEFAULT_REST,
      weight: weightOf(logged),
    };
  });
};

/**
 * The same Exercise's sets on both sides, matched by `order` (ADR 0023): the
 * Workout Session sets that were added, and the Plan sets that were removed. A
 * set is an added one when it carries no `reps_recommended`, unlike a copied
 * one, or when its `order` isn't a Plan set's: replacing the Exercise in the
 * app zeroes every set's targets, so after switching back the first marker is
 * gone. Any other set is a Plan set still there, logged or not.
 */
const matchSets = (planSets: PlanSet[], sessionSets: SessionSet[]) => {
  const planOrders = new Set(planSets.map((set) => set.order));
  const added: SessionSet[] = [];
  const keptOrders = new Set<number>();

  for (const set of sessionSets) {
    if (set.repsRecommended === null || !planOrders.has(set.order)) {
      added.push(set);
    } else {
      keptOrders.add(set.order);
    }
  }

  return {
    added,
    removed: planSets.filter((set) => !keptOrders.has(set.order)),
  };
};

/**
 * The added sets an Exercise gains: only the net difference, so the last added
 * ones, those logged, with the rest of the Plan's last set, up to 20 sets in
 * all. None, `null`.
 */
const extraSets = (
  sessionSets: SessionSet[],
  planSets: PlanSet[]
): RestedSet[] | null => {
  const { added, removed } = matchSets(planSets, sessionSets);
  const rest = planSets.at(-1)?.rest ?? DEFAULT_REST;

  // The first added ones stand in for the removed ones
  const extra = added
    .slice(removed.length)
    .filter(isLogged)
    .slice(0, Math.max(MAX_SETS_PER_EXERCISE - planSets.length, 0))
    .map((set) => ({
      reps: set.repsCompleted,
      rest,
      weight: weightOf(set),
    }));

  return extra.length > 0 ? extra : null;
};

const hasRepeatedOrder = (exerciseSets: { order: number }[]) =>
  new Set(exerciseSets.map((set) => set.order)).size < exerciseSets.length;

/**
 * The Plan sets an Exercise that's the same on both sides loses: only the net
 * difference, so the first removed ones. None for an emptied Exercise, which
 * goes as a whole (`remove_exercise`), or with a repeated set `order` on
 * either side.
 */
const planSetRemoval = ({
  planExercise,
  sessionExercise,
}: Slot): PlannedSetRemoval | null => {
  if (
    !(planExercise && sessionExercise) ||
    planExercise.slug !== sessionExercise.slug ||
    sessionExercise.sets.length === 0 ||
    hasRepeatedOrder(planExercise.sets) ||
    hasRepeatedOrder(sessionExercise.sets)
  ) {
    return null;
  }

  const { added, removed } = matchSets(planExercise.sets, sessionExercise.sets);
  const lost = removed.slice(0, Math.max(removed.length - added.length, 0));

  return lost.length > 0
    ? {
        exerciseSlug: planExercise.slug,
        sets: lost,
        workoutExerciseId: planExercise.id,
      }
    : null;
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
    const sets = replacementSets(sessionExercise.sets, planExercise.sets);

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

  // Every set was removed
  if (sessionExercise.sets.length === 0 && planExercise.sets.length > 0) {
    return {
      exerciseSlug: planExercise.slug,
      kind: "remove_exercise",
      workoutExerciseId: planExercise.id,
    };
  }

  const sets = extraSets(sessionExercise.sets, planExercise.sets);

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

/** Deletes an Exercise's removed sets and renumbers the rest from 1. */
const removeSets = async (
  tx: Transaction,
  { sets: removed, workoutExerciseId }: PlannedSetRemoval
) => {
  await tx.delete(workoutExerciseSets).where(
    inArray(
      workoutExerciseSets.id,
      removed.map((set) => set.id)
    )
  );
  await tx.execute(sql`
    with ranked as (
      select
        ${workoutExerciseSets.id} as id,
        row_number() over (
          order by ${workoutExerciseSets.order}, ${workoutExerciseSets.id}
        ) as new_order
      from ${workoutExerciseSets}
      where ${workoutExerciseSets.workoutExerciseId} = ${workoutExerciseId}
    )
    update ${workoutExerciseSets}
    set "order" = ranked.new_order
    from ranked
    where ${workoutExerciseSets.id} = ranked.id
      and ${workoutExerciseSets.order} <> ranked.new_order
  `);
};

/**
 * Writes the changes in this order: replacements, added and removed sets on
 * their rows, then removals with the remaining Exercises renumbered from 1, then
 * added Exercises appended; then stamps the Workout Session.
 */
const applyChanges = async (
  tx: Transaction,
  sessionId: string,
  workoutId: string,
  changes: PlannedChange[],
  setRemovals: PlannedSetRemoval[]
) => {
  await inSequence(changes, async (change) => {
    if (change.kind === "replace_exercise") {
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
  });

  await inSequence(setRemovals, async (removal) => {
    await removeSets(tx, removal);
  });

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

  await inSequence(changes, async (change) => {
    if (change.kind !== "add_exercise") {
      return;
    }

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
  });

  await tx
    .update(workoutSessions)
    .set({ planChangesAppliedAt: sql`now()` })
    .where(eq(workoutSessions.id, sessionId));
};

const sets = (rested: RestedSet[]) =>
  rested.map(({ reps, weight }) => ({ reps, weight }));

/** A change as the service answers it: slugs and `{ reps, weight }` sets, no rows or rests. */
const toAnswer = (change: PlannedChange): PlanUpdateChange => {
  switch (change.kind) {
    case "replace_exercise": {
      return {
        exercise_slug: change.exerciseSlug,
        kind: change.kind,
        replaced_exercise_slug: change.replacedExerciseSlug,
        sets: sets(change.sets),
      };
    }

    case "remove_exercise": {
      return { exercise_slug: change.exerciseSlug, kind: change.kind };
    }

    case "add_exercise":
    case "add_sets": {
      return {
        exercise_slug: change.exerciseSlug,
        kind: change.kind,
        sets: sets(change.sets),
      };
    }

    default: {
      throw new Error("Unknown Plan Update change");
    }
  }
};

/**
 * The Plan Update of one of the User's Workout Sessions, applied in `tx` when
 * `apply` is set, or `null` when the User has no such Workout Session.
 *
 * Locks, in preview too: ROW EXCLUSIVE on `workout_sessions` and the Workout
 * tables in `deleteUserData`'s order (so a call queues behind
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
  { apply, includeSetRemovals = false }: PlanUpdateOptions & { apply: boolean }
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

  if (sessionWorkout === undefined) {
    return null;
  }

  let workout:
    | {
        cover: string | null;
        id: string;
        name: string;
        planId: string;
        planName: string | null;
      }
    | undefined;

  if (sessionWorkout.workoutId !== null && sessionWorkout.workoutId !== "") {
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
        cover: workouts.cover,
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

    if (workout !== undefined) {
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

  if (session === undefined) {
    return null;
  }

  // No Workout (deleted, or its Plan soft-deleted), or the Workout Session
  // moved off it while we waited for the lock
  if (!workout || session.workoutId !== workout.id) {
    return {
      changes: [],
      plan: null,
      ...(includeSetRemovals && { set_removals: [] }),
      weight_unit: weightUnit,
      workout: null,
    };
  }

  let changes: PlannedChange[] = [];
  let setRemovals: PlannedSetRemoval[] = [];

  if (
    session.finishedAt !== null &&
    session.appliedAt === null &&
    !(await isUnmatchable(tx, sessionId, workout.id))
  ) {
    const slots = await loadSlots(tx, sessionId, workout.id);
    changes = slots.flatMap((slot) => planChange(slot) ?? []);
    setRemovals = includeSetRemovals
      ? slots.flatMap((slot) => planSetRemoval(slot) ?? [])
      : [];

    if (apply) {
      await applyChanges(tx, sessionId, workout.id, changes, setRemovals);
    }
  }

  return {
    changes: changes.map(toAnswer),
    plan: { id: workout.planId, name: workout.planName },
    ...(includeSetRemovals && {
      set_removals: setRemovals.map((removal) => ({
        exercise_slug: removal.exerciseSlug,
        sets: sets(removal.sets),
      })),
    }),
    weight_unit: weightUnit,
    workout: { cover: workout.cover, id: workout.id, name: workout.name },
  };
};

/**
 * The Plan Update of one of the User's Workout Sessions, without writing
 * anything; `null` when the User has no such Workout Session.
 */
export const previewPlanUpdate = async (
  tx: Transaction,
  userId: string,
  sessionId: string,
  options: PlanUpdateOptions = {}
) => await planUpdate(tx, userId, sessionId, { ...options, apply: false });

/**
 * Applies the Plan Update of one of the User's Workout Sessions and answers
 * what it applied (set removals only with `includeSetRemovals`); `null` when the User has no such Workout Session. Once
 * applied, both modes answer no changes, so a repeat writes nothing.
 */
export const applyPlanUpdate = async (
  tx: Transaction,
  userId: string,
  sessionId: string,
  options: PlanUpdateOptions = {}
) => await planUpdate(tx, userId, sessionId, { ...options, apply: true });
