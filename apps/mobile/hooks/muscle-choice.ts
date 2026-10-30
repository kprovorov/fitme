import { type MuscleGroup, muscleGroups } from "@fitme/core";
import { useSyncExternalStore } from "react";

/**
 * The Muscle groups a User can choose, in core's order: full-body and cardio
 * stay out until the Library has such Exercises.
 */
export const choosableMuscleGroups: readonly MuscleGroup[] =
  muscleGroups.filter((group) => group !== "full-body" && group !== "cardio");

/** The groups in core's order, each once, so a choice has one spelling. */
export const inCoreOrder = (
  groups: readonly MuscleGroup[]
): readonly MuscleGroup[] =>
  muscleGroups.filter((group) => groups.includes(group));

const NONE: readonly MuscleGroup[] = [];

/**
 * The confirmed Muscle group choice of each screen listing the Library, by
 * the screen's key, in memory only (never MMKV): the Muscles sheet reads the
 * opener's choice and hands the confirmed one back to that screen alone.
 */
const choices = new Map<string, readonly MuscleGroup[]>();
const listeners = new Set<() => void>();

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
  for (const listener of listeners) {
    listener();
  }
}

/** Forgets a screen's choice (the picker, once closed). */
export function forgetMuscleChoice(key: string): void {
  choices.delete(key);
}

/** Forgets every choice: the app's start, for tests. */
export function resetMuscleChoices(): void {
  choices.clear();
}

let pickers = 0;

/**
 * A fresh key for one opening of a screen whose choice starts over each time
 * (the Exercise picker), starting on `initial`.
 */
export function openMuscleChoice(initial: readonly MuscleGroup[]): string {
  pickers += 1;
  const key = `picker-${pickers}`;
  choices.set(key, inCoreOrder(initial));
  return key;
}

/** The screen's confirmed choice, re-rendering when it changes. */
export function useMuscleChoice(key: string): readonly MuscleGroup[] {
  return useSyncExternalStore(
    subscribe,
    () => getMuscleChoice(key),
    () => getMuscleChoice(key)
  );
}
