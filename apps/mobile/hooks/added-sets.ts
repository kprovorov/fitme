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

// The highest `order` each Workout Session Exercise has given out, so a set
// added after one was removed never takes an `order` a row still holds, or
// gets back when its removal fails.
let highestOrders = new Map<string, number>();

// Each added set's identity: a removed one's is never given out again.
let nextAddedSetNumber = 1;

// Saved sets the User removed, by id: hidden while the removal runs
// (`removing`), and once it's done (`removed`) until a read no longer has
// them. A failed removal shows its set again, in its place.
export interface HiddenSet {
  exerciseId: string;
  state: "removed" | "removing";
}

let hiddenSets = new Map<string, HiddenSet>();
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

/**
 * Adds an unlogged set to the Workout Session Exercise, after
 * `highestOrder` (the highest one its rows hold) and after every one added
 * to it before.
 */
export const addSet = (exerciseId: string, highestOrder: number): void => {
  const nextOrder =
    Math.max(highestOrder, highestOrders.get(exerciseId) ?? 0) + 1;

  highestOrders = new Map(highestOrders).set(exerciseId, nextOrder);

  const id = `local-${nextAddedSetNumber}`;
  nextAddedSetNumber += 1;

  setAddedSetsOf(exerciseId, [
    ...addedSetsOf(exerciseId),
    { id, order: nextOrder },
  ]);
};

/**
 * Keeps `order` from being given to an added set: a saved set holding it is
 * being removed, and comes back if its removal fails.
 */
export const holdOrder = (exerciseId: string, order: number): void => {
  if (order > (highestOrders.get(exerciseId) ?? 0)) {
    highestOrders = new Map(highestOrders).set(exerciseId, order);
  }
};

/** Drops an added set not logged yet: removed, it was only on the phone. */
export const dropAddedSet = (exerciseId: string, id: string): void => {
  const sets = addedSetsOf(exerciseId);
  const left = sets.filter((set) => set.id !== id || set.saved);

  if (left.length < sets.length) {
    setAddedSetsOf(exerciseId, left);
  }
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

/** Drops the added set logging created as `savedId`: it's gone (a 404). */
export const dropGoneAddedSet = (exerciseId: string, savedId: string): void => {
  dropReadAddedSets(exerciseId, new Set([savedId]));
};

/**
 * Forgets the added and removed sets of these Workout Session Exercises (a
 * discard).
 */
export const forgetAddedSets = (exerciseIds: Iterable<string>): void => {
  for (const exerciseId of exerciseIds) {
    if (addedSets.has(exerciseId)) {
      setAddedSetsOf(exerciseId, NO_ADDED_SETS);
    }

    if (highestOrders.has(exerciseId)) {
      highestOrders = new Map(highestOrders);
      highestOrders.delete(exerciseId);
    }

    const hidden = [...hiddenSets].filter(
      ([, set]) => set.exerciseId === exerciseId
    );

    if (hidden.length > 0) {
      hiddenSets = new Map(hiddenSets);

      for (const [id] of hidden) {
        hiddenSets.delete(id);
      }

      emit();
    }
  }
};

/** Hides a saved set of the Workout Session Exercise while its removal runs. */
export const hideRemovedSet = (exerciseId: string, setId: string): void => {
  hiddenSets = new Map(hiddenSets).set(setId, {
    exerciseId,
    state: "removing",
  });
  emit();
};

/** Shows a set whose removal failed again. */
export const showSetAgain = (setId: string): void => {
  if (hiddenSets.has(setId)) {
    hiddenSets = new Map(hiddenSets);
    hiddenSets.delete(setId);
    emit();
  }
};

/** Keeps a removed set hidden until a read no longer has it. */
export const markSetRemoved = (setId: string): void => {
  const hidden = hiddenSets.get(setId);

  if (hidden?.state === "removing") {
    hiddenSets = new Map(hiddenSets).set(setId, {
      ...hidden,
      state: "removed",
    });
    emit();
  }
};

/** Forgets the Workout Session Exercise's removed sets a read no longer has. */
export const forgetUnreadRemovedSets = (
  exerciseId: string,
  readIds: ReadonlySet<string>
): void => {
  const gone = [...hiddenSets].filter(
    ([id, hidden]) =>
      hidden.exerciseId === exerciseId &&
      hidden.state === "removed" &&
      !readIds.has(id)
  );

  if (gone.length > 0) {
    hiddenSets = new Map(hiddenSets);

    for (const [id] of gone) {
      hiddenSets.delete(id);
    }

    emit();
  }
};

const getHiddenSets = () => hiddenSets;

/** The saved sets hidden as removed, by id. */
export const useHiddenSets = (): ReadonlyMap<string, HiddenSet> =>
  useSyncExternalStore(subscribe, getHiddenSets, getHiddenSets);

interface SessionWithSets {
  exercises: readonly { sets: readonly { id: string }[] }[];
}

/**
 * The Workout Session without the saved sets being removed, or removed and
 * still in its read: what its stats and Finish count. A read landing while a
 * removal runs still has the set.
 */
export const withoutRemovedSets = <Session extends SessionWithSets>(
  session: Session,
  hidden: ReadonlyMap<string, HiddenSet> = hiddenSets
): Session =>
  hidden.size === 0
    ? session
    : {
        ...session,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter(({ id }) => !hidden.has(id)),
        })),
      };

/** `withoutRemovedSets`, following the sets being removed. */
export const useWithoutRemovedSets = <Session extends SessionWithSets>(
  session: Session
): Session => withoutRemovedSets(session, useHiddenSets());

/** Forgets every added set (a sign-out, and after each test). */
export const clearAddedSets = (): void => {
  highestOrders = new Map();

  if (hiddenSets.size > 0) {
    hiddenSets = new Map();
    emit();
  }

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
