import { defineTool } from "eve/tools";
import { z } from "zod";

import { clientTimeZone } from "../lib/client-context";
import { requireConversationOwner } from "../lib/owner";
import { NO_WEEKLY_GOAL, readWeeklyGoal } from "../lib/weekly-goal";

export default defineTool({
  description:
    "Get the user's Weekly goal: the active plan's workouts per week, this week's count of qualifying workout sessions (finished, with a logged rep) against it, the Weekly streak (consecutive weeks the goal was hit, this week counted once hit) and the last 8 Monday–Sunday weeks, oldest first, each with its count, its own goal and whether it was hit (kind unknown: no goal was known for it). Weeks are in the user's time zone. Without an active plan there is no Weekly goal.",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    return (
      (await readWeeklyGoal(userId, clientTimeZone(ctx.messages))) ?? {
        error: NO_WEEKLY_GOAL,
      }
    );
  },
  inputSchema: z.object({}),
});
