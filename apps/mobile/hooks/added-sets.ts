import { useCallback, useSyncExternalStore } from "react";

import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";

/**
 * A set added with Add Set in an open Workout Session and not read back yet.
 * The Public API has no route creating an unlogged set, so it lives on the
 * phone until the User logs it, which creates it, and a read has it.
 */
export interface AddedSet {
  id: string;
  order: number;
  /** The set logging it created, until the Workout Session's read has it. */
  saved?: SavedWorkoutSessionExerciseSet;
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

/** Keeps the set logging an added one created, to show it until it's read. */
export const markAddedSetSaved = (
  exerciseId: string,
  id: string,
  saved: SavedWorkoutSessionExerciseSet
): void => {
  setAddedSetsOf(
    exerciseId,
    addedSetsOf(exerciseId).map((set) =>
      set.id === id ? { ...set, saved } : set
    )
  );
};

/** Drops the added sets logging has created, once a read has them. */
export const dropReadAddedSets = (
  exerciseId: string,
  readIds: ReadonlySet<string>
): void => {
  const sets = addedSetsOf(exerciseId);

  const left = sets.filter(({ saved }) => !saved || !readIds.has(saved.id));

  if (left.length < sets.length) {
    setAddedSetsOf(exerciseId, left);
  }
};

/** Forgets the added sets of these Workout Session Exercises (a discard). */
export const forgetAddedSets = (exerciseIds: Iterable<string>): void => {
  for (const exerciseId of exerciseIds) {
    if (addedSets.has(exerciseId)) {
      setAddedSetsOf(exerciseId, NO_ADDED_SETS);
    }
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

/** The Workout Session Exercise's added sets no read has yet, oldest first. */
export const useAddedSets = (exerciseId: string): readonly AddedSet[] => {
  const getSnapshot = useCallback(() => addedSetsOf(exerciseId), [exerciseId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
