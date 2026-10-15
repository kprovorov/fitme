import { asUser } from "@fitme/db";
import { getActivePlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's currently active workout plan with all workouts and exercises",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const plan = await asUser(userId, (tx) => getActivePlan(tx, userId));
    return plan ?? { error: "No active plan found" };
  },
  inputSchema: z.object({}),
});
