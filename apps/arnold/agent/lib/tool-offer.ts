import type { ArnoldCardId } from "@fitme/core/arnold";
import type { HistoryMessage } from "eve/context";
import { defineDynamic } from "eve/tools";
import type { DynamicToolEntry } from "eve/tools";

import { clientCards } from "./client-context";

/**
 * Whether the build sending this model call can draw `card` (ADR 0027): it
 * listed the card in its client context's `cards`. A build that sent no list
 * is an old build, which can draw none of the new cards.
 */
export const canDrawCard = (
  messages: readonly HistoryMessage[],
  card: ArnoldCardId
): boolean => clientCards(messages)?.includes(card) ?? false;

/** `tool` when the build can draw `card`, `null` (not offered) otherwise. */
export const toolForCard = <Tool extends DynamicToolEntry>(
  messages: readonly HistoryMessage[],
  card: ArnoldCardId,
  tool: Tool
): Tool | null => (canDrawCard(messages, card) ? tool : null);

/**
 * A tool file's default export for a tool offered only to a build that can
 * draw `card`: eve resolves it before every model call, from that call's
 * messages, so a build that sent no list, or one without the card, never
 * sees the tool.
 *
 * ```ts
 * export default offeredForCard("workout", defineTool({ … }));
 * ```
 */
export const offeredForCard = <Tool extends DynamicToolEntry>(
  card: ArnoldCardId,
  tool: Tool
) =>
  defineDynamic(async (ctx) => toolForCard(await ctx.messages(), card, tool));
