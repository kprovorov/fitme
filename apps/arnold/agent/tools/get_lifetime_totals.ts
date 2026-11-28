import { asUser } from "@fitme/db";
import { getLifetimeTotals } from "@fitme/services/lifetime-totals";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's lifetime training totals over every finished workout session with at least one logged rep: workout_count, duration_seconds (start to finish, summed) and volume (weight × reps, in weight_unit). Zeros for a user who hasn't trained yet.",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    return await asUser(
      userId,
      async (tx) => await getLifetimeTotals(tx, userId)
    );
  },
  inputSchema: z.object({}),
});
