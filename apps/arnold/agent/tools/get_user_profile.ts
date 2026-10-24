import { asUser } from "@fitme/db";
import { getProfile } from "@fitme/services/profile";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's profile including age, gender, height, weight, and preferred measurement system",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const profile = await asUser(userId, (tx) => getProfile(tx, userId));
    return profile ?? { error: "Profile not found" };
  },
  inputSchema: z.object({}),
});
