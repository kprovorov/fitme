import { muscleGroups } from "@fitme/core";
import type { MuscleGroup } from "@fitme/core";

import { createChoiceStore } from "~/hooks/choice-store";

/**
 * The Muscle groups a User can choose, in core's order: full-body and cardio
 * stay out until the Library has such Exercises.
 */
export const choosableMuscleGroups: readonly MuscleGroup[] =
  muscleGroups.filter((group) => group !== "full-body" && group !== "cardio");

/**
 * The confirmed Muscle group choice of each screen listing the Library, by
 * the screen's key (`hooks/choice-store.ts`).
 */
const store = createChoiceStore(choosableMuscleGroups);

/**
 * The choosable groups among `groups`, in core's order, each once, so a
 * choice has one spelling (and never a group the sheet can't untick).
 */
export const inCoreOrder = store.inOrder;

export const getMuscleChoice = store.get;
export const setMuscleChoice = store.set;
export const forgetMuscleChoice = store.forget;
export const resetMuscleChoices = store.resetAll;
export const newMuscleChoiceKey = store.newKey;
export const useMuscleChoiceOpening = store.useOpening;
export const useMuscleChoice = store.use;
