import { type MuscleGroup, muscleGroups } from "@fitme/core";
import { useEffect, useSyncExternalStore } from "react";

/**
 * The Muscle groups a User can choose, in core's order: full-body and cardio
 * stay out until the Library has such Exercises.
 */
export const choosableMuscleGroups: readonly MuscleGroup[] =
  muscleGroups.filter((group) => group !== "full-body" && group !== "cardio");

/**
 * The choosable groups among `groups`, in core's order, each once, so a
 * choice has one spelling (and never a group the sheet can't untick).
 */
export const inCoreOrder = (
  groups: readonly MuscleGroup[]
): readonly MuscleGroup[] =>
  choosableMuscleGroups.filter((group) => groups.includes(group));

const NONE: readonly MuscleGroup[] = [];

/**
 * The confirmed Muscle group choice of each screen listing the Library, by
 * the screen's key, in memory only (never MMKV): the Muscles sheet reads the
 * opener's choice and hands the confirmed one back to that screen alone.
 */
const choices = new Map<string, readonly MuscleGroup[]>();
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

/** A screen's confirmed choice, in core's order (none by default). */
export const getMuscleChoice = (key: string): readonly MuscleGroup[] =>
  choices.get(key) ?? NONE;

export function setMuscleChoice(
  key: string,
  groups: readonly MuscleGroup[]
): void {
  choices.set(key, inCoreOrder(groups));
  emit();
}

/** Forgets a screen's choice (the picker, once closed). */
export function forgetMuscleChoice(key: string): void {
  choices.delete(key);
  emit();
}

/** Forgets every choice: the app's start, for tests. */
export function resetMuscleChoices(): void {
  choices.clear();
  emit();
}

let pickers = 0;

/**
 * A fresh key for one opening of a screen whose choice starts over each time
 * (the Exercise picker): hold it with `useMuscleChoiceOpening`.
 */
export function newMuscleChoiceKey(): string {
  pickers += 1;
  return `picker-${pickers}`;
}

/**
 * Starts `key` on `initial` while the screen is mounted and forgets it once
 * it closes. An effect torn down and set up again (Fast Refresh) seeds it
 * anew rather than losing it.
 */
export function useMuscleChoiceOpening(
  key: string,
  initial: readonly MuscleGroup[]
): void {
  if (!choices.has(key)) {
    // Before the first render reads it, so the first search is the seeded one.
    choices.set(key, inCoreOrder(initial));
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: seeded once per key; `initial` is only the opening's start
  useEffect(() => {
    if (!choices.has(key)) {
      setMuscleChoice(key, initial);
    }
    return () => forgetMuscleChoice(key);
  }, [key]);
}

/** The screen's confirmed choice, re-rendering when it changes. */
export function useMuscleChoice(key: string): readonly MuscleGroup[] {
  return useSyncExternalStore(
    subscribe,
    () => getMuscleChoice(key),
    () => getMuscleChoice(key)
  );
}
