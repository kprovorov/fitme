import { asUser } from "@fitme/db";
import { listPlans } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "List all workout plans for the user with their names, goals, and active status",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    return await asUser(userId, (tx) => listPlans(tx, userId));
  },
  inputSchema: z.object({}),
});
