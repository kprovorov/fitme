import { asUser } from "@fitme/db";
import { removeSetFromWorkoutSession } from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Remove one set from the workout session the user has open right now; their plan stays as it is. Find set IDs via get_open_workout_session, never get_active_plan. Ask the user in the chat before removing a logged set. To remove a set from the plan, use remove_set_from_exercise.",
  async execute({ set_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const { status } = await asUser(
      userId,
      async (tx) => await removeSetFromWorkoutSession(tx, userId, set_id)
    );

    if (status === "session_finished") {
      return {
        error: "The workout session is already finished; nothing was removed",
      };
    }

    // A re-run step repeats a removal that already committed
    return status === "removed"
      ? { set_id, success: true }
      : { error: "Set not found: it doesn't exist or was already removed" };
  },
  inputSchema: z.object({
    set_id: z
      .guid()
      .describe("The ID of the set in the open workout session to remove"),
  }),
});
