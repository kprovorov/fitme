import { asUser } from "@fitme/db";
import { listExerciseNotes } from "@fitme/services/exercise-notes";
import { getActivePlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { requireConversationOwner } from "../lib/owner";
import { shownPlan } from "../lib/plans";

export default defineTool({
  description:
    "Get the user's currently active workout plan with all workouts and exercises, each exercise with the user's exercise note (exercise_note, null for none), and the plan's version marker (plan_version)",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const { notes, plan } = await asUser(userId, async (tx) => {
      const active = await getActivePlan(tx, userId);

      return {
        notes: active ? await listExerciseNotes(tx, userId) : [],
        plan: active,
      };
    });

    if (!plan) {
      return { error: "No active plan found" };
    }

    return await shownPlan(plan, appLanguage(ctx.messages), notes);
  },
  inputSchema: z.object({}),
});
