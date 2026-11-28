import { arnoldCards } from "@fitme/core";
import type { ArnoldCardId } from "@fitme/core";

import { arnoldCardRegistry } from "./registry";
import type { ArnoldCardEntry } from "./registry";

/** The View holding a message's cards, below Arnold's bubble. */
export const ARNOLD_CARDS = "arnold-cards";

/**
 * The ids of the cards this build announces to Arnold, in `arnoldCards`'
 * order: what a send carries as its client context's `cards`.
 */
export const announcedArnoldCardIds = (): ArnoldCardId[] => {
  const ids: ArnoldCardId[] = [];

  for (const card of arnoldCards) {
    if (arnoldCardRegistry[card.tool]?.announced) {
      ids.push(card.id);
    }
  }

  return ids;
};

/** The registered card a tool draws, if it's a registered show tool. */
export const arnoldCardFor = (
  toolName: string
): ArnoldCardEntry | undefined => {
  const card = arnoldCards.find(({ tool }) => tool === toolName);

  return card ? arnoldCardRegistry[card.tool] : undefined;
};
