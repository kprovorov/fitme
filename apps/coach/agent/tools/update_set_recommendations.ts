import { asUser } from "@fitme/db";
import { updateSetRecommendations } from "@fitme/services/workout-edits";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Update the recommended reps, weight, or rest time on a specific set. Provide only the fields that need to change. Find set IDs via get_active_plan in the 'sets' array of each exercise.",
  async execute({ set_id, ...changes }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    // Checked here rather than with a refinement, which would turn the input
    // schema into a ZodEffects; ai-agent refused the same input
    if (Object.keys(changes).length === 0) {
      return {
        error:
          "At least one of reps_recommended, weight_recommended, or rest_recommended must be provided",
      };
    }
    const updated = await asUser(userId, (tx) =>
      updateSetRecommendations(tx, userId, set_id, changes)
    );
    return updated
      ? { set_id, success: true, updated: changes }
      : { error: "Set not found" };
  },
  inputSchema: z.object({
    reps_recommended: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("New recommended rep count"),
    rest_recommended: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("New recommended rest duration in seconds"),
    set_id: z
      .string()
      .uuid()
      .describe("The ID of the workout_exercise_sets row to update"),
    weight_recommended: z
      .number()
      .min(0)
      .optional()
      .describe("New recommended weight in the user's unit system"),
  }),
});
