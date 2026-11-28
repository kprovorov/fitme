import { defineTool } from "eve/tools";
import { z } from "zod";

import { readLifetimeTotals } from "../lib/lifetime-totals";
import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

export const tool = defineTool({
  description:
    "Show the user a card of their lifetime training totals: workouts, training time and volume, read from their data (the same numbers get_lifetime_totals answers). A user who hasn't trained yet still gets the card, with zeros.",
  async execute(_input, ctx) {
    return await readLifetimeTotals(requireConversationOwner(ctx.session.auth));
  },
  inputSchema: z.object({}),
});

export default offeredForCard("lifetime_totals", tool);
