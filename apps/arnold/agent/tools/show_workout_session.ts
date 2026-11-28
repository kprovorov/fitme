import { asUser } from "@fitme/db";
import { getWorkoutSession } from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

/**
 * The Workout Session card (ADR 0027): checks the Workout Session is the
 * User's and answers its id; the app reads and draws it. Writes nothing. A
 * refusal is a thrown tool error, never an `{ error }` result.
 */
export const tool = defineTool({
  description:
    "Show the user one of their workout sessions as a card in the chat, with its date, duration, sets, volume and personal records, opening its summary on tap. Pass a workout session id from get_workouts_history or get_open_workout_session; the card shows the session as it is now, so don't repeat its numbers in your answer.",
  async execute({ workout_session_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    // RLS hides every other User's Workout Sessions
    const session = await asUser(
      userId,
      async (tx) => await getWorkoutSession(tx, workout_session_id)
    );

    if (!session) {
      throw new Error(
        `No workout session ${workout_session_id} for the user: it doesn't exist or was deleted. Read get_workouts_history for the current workout session ids.`
      );
    }

    return { workout_session_id: session.id };
  },
  inputSchema: z.object({
    workout_session_id: z
      .guid()
      .describe("The id of the workout session to show"),
  }),
});

export default offeredForCard("workout_session", tool);
