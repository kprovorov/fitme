import { equipment } from "@fitme/core";

import { createChoiceStore } from "~/hooks/choice-store";

/**
 * The confirmed Equipment choice of each screen listing the Library, by the
 * screen's key (`hooks/choice-store.ts`): every one of the new Library's
 * Equipment (ADR 0022) in core's order is choosable, `bodyweight` (the body
 * is the load) among them.
 */
const store = createChoiceStore(equipment);

/** The Equipment among `chosen`, in core's order, each once. */
export const equipmentInCoreOrder = store.inOrder;

export const getEquipmentChoice = store.get;
export const setEquipmentChoice = store.set;
export const forgetEquipmentChoice = store.forget;
export const resetEquipmentChoices = store.resetAll;
export const newEquipmentChoiceKey = store.newKey;
export const useEquipmentChoiceOpening = store.useOpening;
export const useEquipmentChoice = store.use;
