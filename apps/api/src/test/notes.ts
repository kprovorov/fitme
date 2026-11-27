import type { WorkoutSessionSet } from "@fitme/services/workout-sessions";

/**
 * A set as the Public API shows it: without its `note`, which no route
 * answers yet, so a services fixture can stand for the expected body too.
 */
export const shownSet = ({ note: _note, ...set }: WorkoutSessionSet) => set;

/** A Workout Session Exercise (or anything with sets) as the API shows it. */
export const shownSets = <T extends { sets: WorkoutSessionSet[] }>(
  value: T
) => ({ ...value, sets: value.sets.map(shownSet) });
