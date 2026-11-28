import { asUser } from "@fitme/db";
import { listPlans } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

/**
 * The Workout card (ADR 0027): checks the Workout is in one of the User's
 * live Plans and answers its id and its Plan's id; the app reads and draws
 * it, with Start or Continue. Writes nothing. A refusal is a thrown tool
 * error, never an `{ error }` result.
 */
export const tool = defineTool({
  description:
    "Show the user one workout of their plans as a card in the chat, with its exercises and a Start (or Continue) button, opening the workout on tap. Pass a workout id from get_active_plan or get_plans; the card shows the workout as it is now, so don't repeat its exercises in your answer.",
  async execute({ workout_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    // Live Plans only, so a Workout of a deleted Plan is refused; RLS and the
    // service's own filter hide every other User's
    const plans = await asUser(
      userId,
      async (tx) => await listPlans(tx, userId)
    );

    const wanted = workout_id.toLowerCase();

    const plan = plans.find(({ workouts }) =>
      workouts.some(({ id }) => id.toLowerCase() === wanted)
    );

    if (!plan) {
      throw new Error(
        `No workout ${workout_id} in the user's plans: it doesn't exist, was removed or its plan was deleted. Read get_active_plan or get_plans for the current workout ids.`
      );
    }

    return { plan_id: plan.id, workout_id: wanted };
  },
  inputSchema: z.object({
    workout_id: z.guid().describe("The id of the workout to show"),
  }),
});

export default offeredForCard("workout", tool);
