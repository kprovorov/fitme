import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import {
  DEFAULT_HISTORY_ENTRIES,
  MAX_HISTORY_ENTRIES,
  readExerciseHistory,
} from "../lib/exercise-history";
import { exerciseSlugSchema } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's history of one exercise: their most recent workout sessions with it, newest first, each with its date and logged sets (weights in weight_unit, null for a bodyweight set), the total number of sessions with it, and best_result, their best result so far by the personal record rule (the highest weight, with the most reps at it; null before any finished session). An empty entries list means they haven't logged it yet.",
  async execute({ exercise_slug, limit }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    return await readExerciseHistory(userId, {
      exerciseSlug: exercise_slug,
      language: appLanguage(ctx.messages),
      limit,
    });
  },
  inputSchema: z.object({
    exercise_slug: exerciseSlugSchema.describe(
      "The exercise's exercise_slug, as search_exercises, the plan or the workout history returns it"
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_HISTORY_ENTRIES)
      .default(DEFAULT_HISTORY_ENTRIES)
      .describe(
        `Number of recent sessions to show (default ${DEFAULT_HISTORY_ENTRIES}, max ${MAX_HISTORY_ENTRIES})`
      ),
  }),
});
