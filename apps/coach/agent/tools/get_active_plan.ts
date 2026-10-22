import { asUser } from "@fitme/db";
import { getActivePlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { withExerciseDetails } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's currently active workout plan with all workouts and exercises",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const plan = await asUser(userId, (tx) => getActivePlan(tx, userId));
    if (!plan) {
      return { error: "No active plan found" };
    }
    const named = await withExerciseDetails(
      plan.workouts.map(({ exercises }) => exercises)
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
