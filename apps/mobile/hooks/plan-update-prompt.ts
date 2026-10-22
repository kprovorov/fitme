import type { MeasurementSystem, PlanChanges } from "@fitme/core";
import { useSyncExternalStore } from "react";

/**
 * The "Update your plan?" question for a Workout Session that has just
 * finished. `onDone` opens its Summary, once the User has answered.
 */
export interface PlanUpdatePrompt {
  /** The User's, for the weights' unit. */
  measurementSystem: MeasurementSystem;
  onDone: () => void;
  preview: PlanChanges;
  sessionId: string;
}

let current: PlanUpdatePrompt | null = null;
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

const getSnapshot = () => current;

/**
 * Asks the question. It lives outside the screen that finished the session:
 * the Workout card that finished it from Home is gone once the Plan refetches,
 * so `PlanUpdateSheetHost` (in the root layout) shows it.
 */
export function showPlanUpdatePrompt(prompt: PlanUpdatePrompt): void {
  current = prompt;
  emit();
}

/** Closes the question, if it's still the one for `sessionId`. */
export function closePlanUpdatePrompt(sessionId: string): void {
  if (current?.sessionId !== sessionId) {
    return;
  }
  current = null;
  emit();
}

/** The open question, or null. */
export function usePlanUpdatePrompt(): PlanUpdatePrompt | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
