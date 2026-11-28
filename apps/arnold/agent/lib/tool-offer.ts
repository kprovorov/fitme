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

/** `tool` unless the build can draw `card`, `null` (not offered) when it can. */
export const toolUnlessCard = <Tool extends DynamicToolEntry>(
  messages: readonly HistoryMessage[],
  card: ArnoldCardId,
  tool: Tool
): Tool | null => (canDrawCard(messages, card) ? null : tool);

/**
 * A tool file's default export for a tool a build that can draw `card` no
 * longer gets, since the card replaces it: the direct Plan edits and the old
 * plan card for a build that draws the Plan Proposal (ADR 0027). A build that
 * sent no list, or one without the card, keeps the tool.
 *
 * ```ts
 * export const tool = defineTool({ … });
 * export default withheldForCard("plan_proposal", tool);
 * ```
 */
export const withheldForCard = <Tool extends DynamicToolEntry>(
  card: ArnoldCardId,
  tool: Tool
) =>
  defineDynamic(async (ctx) =>
    toolUnlessCard(await ctx.messages(), card, tool)
  );

/**
 * `offeredForCard` for a tool that keeps state for one model call: `build`
 * makes a fresh copy each time eve resolves the tool, which it does before
 * every model call, and the calls of that model call's response share it.
 * `propose_plan` keeps the one proposal a response may make this way.
 */
export const offeredForCardPerModelCall = <Tool extends DynamicToolEntry>(
  card: ArnoldCardId,
  build: () => Tool
) =>
  defineDynamic(async (ctx) =>
    canDrawCard(await ctx.messages(), card) ? build() : null
  );
