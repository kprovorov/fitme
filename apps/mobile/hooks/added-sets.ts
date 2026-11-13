import { useCallback, useSyncExternalStore } from "react";

/**
 * A set added with Add Set in an open Workout Session and not logged yet.
 * The Public API has no route creating an unlogged set, so it lives on the
 * phone until the User logs it, which creates it.
 */
export interface AddedSet {
  id: string;
  order: number;
}

const NO_ADDED_SETS: readonly AddedSet[] = [];

// Keyed by Workout Session Exercise id, in memory only (never MMKV): the
// session screen and the Workout Session Exercise screen show the same rows.
let addedSets = new Map<string, readonly AddedSet[]>();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const addedSetsOf = (exerciseId: string): readonly AddedSet[] =>
  addedSets.get(exerciseId) ?? NO_ADDED_SETS;

const setAddedSetsOf = (exerciseId: string, sets: readonly AddedSet[]) => {
  const next = new Map(addedSets);

  if (sets.length === 0) {
    next.delete(exerciseId);
  } else {
    next.set(exerciseId, sets);
  }

  addedSets = next;
  emit();
};

/** Adds an unlogged set to the Workout Session Exercise at `order`. */
export const addSet = (exerciseId: string, order: number): void => {
  setAddedSetsOf(exerciseId, [
    ...addedSetsOf(exerciseId),
    { id: `local-${Date.now()}-${order}`, order },
  ]);
};

/** Drops an added set, once logging it has created it. */
export const dropAddedSet = (exerciseId: string, id: string): void => {
  const sets = addedSetsOf(exerciseId);

  if (sets.some((set) => set.id === id)) {
    setAddedSetsOf(
      exerciseId,
      sets.filter((set) => set.id !== id)
    );
  }
};

/** Forgets every added set (a sign-out, and after each test). */
export const clearAddedSets = (): void => {
  if (addedSets.size === 0) {
    return;
  }

  addedSets = new Map();
  emit();
};

/** The Workout Session Exercise's unlogged added sets, oldest first. */
export const useAddedSets = (exerciseId: string): readonly AddedSet[] => {
  const getSnapshot = useCallback(() => addedSetsOf(exerciseId), [exerciseId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
