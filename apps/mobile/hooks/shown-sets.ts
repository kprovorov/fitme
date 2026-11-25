import { useMemo } from "react";

import { useAddedSets } from "~/hooks/added-sets";
import type { WorkoutSessionSet } from "~/hooks/queries/workout-sessions";

/** A row of a Workout Session Exercise's sets table. */
export interface ShownSet {
  /** The set's id, or the added set's while it isn't saved. */
  id: string;
  /**
   * The number it shows: its position, since a removed set leaves a gap in
   * the stored `order` (ADR 0023).
   */
  number: number;
  order: number;
  /** `null` for an added set not logged yet. */
  set: WorkoutSessionSet | null;
}

const NO_SETS: readonly WorkoutSessionSet[] = [];

/**
 * The sets shown for a Workout Session Exercise, numbered by position: the
 * saved ones by their `order`, then the added ones not logged yet (none in a
 * finished Workout Session).
 */
export const useShownSets = (
  exerciseId: string,
  sets: readonly WorkoutSessionSet[] = NO_SETS,
  isReadOnly = false
): ShownSet[] => {
  const addedSets = useAddedSets(exerciseId);

  return useMemo(() => {
    const added = isReadOnly ? [] : addedSets;
    const readIds = new Set(sets.map(({ id }) => id));

    const saved = [...sets];
    const unlogged: Omit<ShownSet, "number">[] = [];

    for (const addedSet of added) {
      if (!addedSet.saved) {
        unlogged.push({ id: addedSet.id, order: addedSet.order, set: null });
      } else if (!readIds.has(addedSet.saved.id)) {
        // Just logged: it stays in its place until a read has it.
        saved.push(addedSet.saved);
      }
    }

    const rows = [
      ...saved
        .toSorted((a, b) => a.order - b.order)
        .map((set) => ({ id: set.id, order: set.order, set })),
      ...unlogged,
    ];

    return rows.map((row, index) => ({ ...row, number: index + 1 }));
  }, [addedSets, isReadOnly, sets]);
};

/** Whether the row's set is still to log. */
export const isUnlogged = ({ set }: ShownSet): boolean =>
  (set?.reps_completed ?? null) === null;

/**
 * The first row still to log, or `undefined` with none left. `loggedId` was
 * logged just now, which the rows may not show yet.
 */
export const nextUnloggedSet = (
  rows: readonly ShownSet[],
  loggedId: string
): ShownSet | undefined =>
  rows.find((row) => row.id !== loggedId && isUnlogged(row));
