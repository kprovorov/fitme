import { asUser } from "@fitme/db";
import { getPlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

/**
 * The Plan card (ADR 0027): checks the Plan is one of the User's live ones
 * and answers its id; the app reads and draws it. Writes nothing. A refusal
 * is a thrown tool error, never an `{ error }` result.
 */
export const tool = defineTool({
  description:
    "Show the user one of their plans as a card in the chat, with whether it's active and its workouts, opening the plan on tap. Pass a plan id from get_plans or get_active_plan; the card shows the plan as it is now, so don't repeat its workouts in your answer.",
  async execute({ plan_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const plan = await asUser(
      userId,
      async (tx) => await getPlan(tx, userId, plan_id)
    );

    if (!plan) {
      throw new Error(
        `No plan ${plan_id} for the user: it doesn't exist or was deleted. Read get_plans for the current plan ids.`
      );
    }

    return { plan_id: plan.id };
  },
  inputSchema: z.object({
    plan_id: z.guid().describe("The id of the plan to show"),
  }),
});

export default offeredForCard("plan", tool);
