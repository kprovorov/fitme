import type { ArnoldCard } from "@fitme/core";
import type { ComponentType } from "react";

/** What a card is drawn from: its show tool's call, once it has succeeded. */
export interface ArnoldCardProps {
  /** The tool call's input, as Arnold sent it. */
  input: unknown;
  /** The tool's successful result. */
  result: unknown;
  toolCallId: string;
}

/** How the build draws one of Arnold's cards (ADR 0027). */
export interface ArnoldCardEntry {
  /**
   * Whether the build tells Arnold it can draw this card (the client
   * context's `cards`), so he's offered its show tool. A card not announced
   * is still drawn for a result already in the Conversation.
   */
  announced: boolean;
  /** Draws the card, at full width outside Arnold's bubble. */
  Card: ComponentType<ArnoldCardProps>;
}

export type ArnoldCardRegistry = Partial<
  Record<ArnoldCard["tool"], ArnoldCardEntry>
>;

/**
 * The cards this build draws, by their show tool's name (`@fitme/core`'s
 * `arnoldCards`), read only while the Arnold redesign flag is on. Each card's
 * ticket adds its one line here, in `arnoldCards`' order.
 */
export const arnoldCardRegistry: ArnoldCardRegistry = {};
