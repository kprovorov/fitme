import { defineTool } from "eve/tools";
import { z } from "zod";

import { readLifetimeTotals } from "../lib/lifetime-totals";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's lifetime training totals over every finished workout session with at least one logged rep: workout_count, duration_seconds (start to finish, summed) and volume (weight × reps, in weight_unit). Zeros for a user who hasn't trained yet.",
  async execute(_input, ctx) {
    return await readLifetimeTotals(requireConversationOwner(ctx.session.auth));
  },
  inputSchema: z.object({}),
});
