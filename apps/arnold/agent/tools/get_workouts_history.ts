import { asUser } from "@fitme/db";
import { listWorkoutHistory } from "@fitme/services/workout-sessions";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { libraryLanguage } from "../lib/client-context";
import { withExerciseDetails } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's recent completed workout sessions with exercises and actual sets performed. Use this to analyze progress, spot patterns, or give personalized advice.",
  async execute({ limit }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const history = await asUser(userId, (tx) =>
      listWorkoutHistory(tx, { limit })
    );
    const named = await withExerciseDetails(
      history.map(({ exercises }) => exercises),
      libraryLanguage(ctx.messages)
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
