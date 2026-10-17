import { asUser } from "@fitme/db";
import { activatePlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description: "Set a specific plan as the user's active plan",
  async execute({ plan_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const plan = await asUser(userId, (tx) =>
      activatePlan(tx, userId, plan_id)
    );
    return plan ? { plan_id, success: true } : { error: "Plan not found" };
  },
  inputSchema: z.object({
    plan_id: z.guid().describe("The ID of the plan to activate"),
  }),
});
