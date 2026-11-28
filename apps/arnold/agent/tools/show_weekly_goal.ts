import { defineTool } from "eve/tools";
import { z } from "zod";

import { clientTimeZone } from "../lib/client-context";
import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";
import { NO_WEEKLY_GOAL, readWeeklyGoal } from "../lib/weekly-goal";

export const tool = defineTool({
  description:
    "Show the user a card of their Weekly goal: this week against the goal, their Weekly streak and the last 8 weeks, read from their data (the same numbers get_weekly_goal answers). Use it when the user asks how consistent they've been. Without an active plan there is no Weekly goal, and no card.",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const weeklyGoal = await readWeeklyGoal(
      userId,
      clientTimeZone(ctx.messages)
    );

    // The app draws every successful result as a card.
    if (weeklyGoal === null) {
      throw new Error(`${NO_WEEKLY_GOAL}; no card was shown.`);
    }

    return weeklyGoal;
  },
  inputSchema: z.object({}),
});

export default offeredForCard("weekly_goal", tool);
