import { asUser } from "@fitme/db";
import { listExerciseNotes } from "@fitme/services/exercise-notes";
import { getPlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { requireConversationOwner } from "../lib/owner";
import { shownPlan } from "../lib/plans";

export default defineTool({
  description:
    "Get one of the user's workout plans by its ID (from get_plans) with all workouts and exercises, each exercise with the user's exercise note (exercise_note, null for none), and the plan's version marker (plan_version)",
  async execute({ plan_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const { notes, plan } = await asUser(userId, async (tx) => {
      const found = await getPlan(tx, userId, plan_id);

      return {
        notes: found ? await listExerciseNotes(tx, userId) : [],
        plan: found,
      };
    });

    if (!plan) {
      return {
        error:
          "No plan found with that ID. Call get_plans for the user's plans and their IDs.",
      };
    }

    return await shownPlan(plan, appLanguage(ctx.messages), notes);
  },
  inputSchema: z.object({
    plan_id: z.guid().describe("The ID of the plan to read, from get_plans"),
  }),
});
