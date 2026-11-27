import { asUser } from "@fitme/db";
import { listExerciseNotes } from "@fitme/services/exercise-notes";
import { getActivePlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { withExerciseDetails } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's currently active workout plan with all workouts and exercises, each exercise with the user's exercise note (exercise_note, null for none)",
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

    const named = await withExerciseDetails(
      plan.workouts.map(({ exercises }) => exercises),
      appLanguage(ctx.messages),
      notes
    );

    return {
      ...plan,
      workouts: plan.workouts.map((workout, index) => ({
        ...workout,
        exercises: named[index],
      })),
    };
  },
  inputSchema: z.object({}),
});
