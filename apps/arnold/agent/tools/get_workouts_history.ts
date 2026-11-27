import { asUser } from "@fitme/db";
import { listExerciseNotes } from "@fitme/services/exercise-notes";
import { listWorkoutHistory } from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { withExerciseDetails } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's recent completed workout sessions with exercises and actual sets performed: each set's id, logged values, targets and note (null for none), and each exercise with the user's exercise note (exercise_note, null for none). Use this to analyze progress, spot patterns, or give personalized advice.",
  async execute({ limit }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const { history, notes } = await asUser(userId, async (tx) => {
      const sessions = await listWorkoutHistory(tx, { limit });

      return {
        history: sessions,
        notes: sessions.length > 0 ? await listExerciseNotes(tx, userId) : [],
      };
    });

    const named = await withExerciseDetails(
      history.map(({ exercises }) => exercises),
      appLanguage(ctx.messages),
      notes
    );

    return history.map((session, index) => ({
      ...session,
      exercises: named[index],
    }));
  },
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Number of recent sessions to fetch (default 10, max 20)"),
  }),
});
