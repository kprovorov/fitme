import { muscleGroups } from "@fitme/core";
import type { MuscleGroup } from "@fitme/core";

import { createChoiceStore } from "~/hooks/choice-store";

/**
 * The confirmed Muscle group choice of each screen listing the Library, by
 * the screen's key (`hooks/choice-store.ts`): every one of the new Library's
 * Muscle groups (ADR 0022) is choosable, in core's order.
 */
const store = createChoiceStore(muscleGroups);

/**
 * The Muscle groups among `groups`, in core's order, each once, so a choice
 * has one spelling (and never a group the sheet can't untick).
 */
export const inCoreOrder = store.inOrder;

export const getMuscleChoice = store.get;
export const setMuscleChoice = store.set;
export const forgetMuscleChoice = store.forget;
export const resetMuscleChoices = store.resetAll;
export const newMuscleChoiceKey = store.newKey;
export const useMuscleChoiceOpening = store.useOpening;
export const useMuscleChoice = store.use;

/** Whether a route param names one of core's Muscle groups. */
export const isMuscleGroup = (
  value: string | undefined
): value is MuscleGroup => muscleGroups.some((group) => group === value);
