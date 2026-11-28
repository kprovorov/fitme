import { asUser } from "@fitme/db";
import { getProfile } from "@fitme/services/profile";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

/**
 * The Profile card (ADR 0027): checks the User has a Profile and answers
 * nothing but success; the app reads and draws it. Writes nothing. A refusal
 * is a thrown tool error, never an `{ error }` result.
 */
export const tool = defineTool({
  description:
    "Show the user their profile as a card in the chat, with their age, height, weight and units, opening Edit Profile on tap. The card shows the profile as it is now, so don't repeat its numbers in your answer.",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const profile = await asUser(
      userId,
      async (tx) => await getProfile(tx, userId)
    );

    if (!profile) {
      throw new Error(
        "The user has no profile yet: they set it up in the app's onboarding. Answer in text instead."
      );
    }

    return {};
  },
  inputSchema: z.object({}),
});

export default offeredForCard("profile", tool);
