import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import {
  DEFAULT_HISTORY_ENTRIES,
  readExerciseHistory,
} from "../lib/exercise-history";
import { exerciseSlugSchema } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

/**
 * Throws unless the Library knows `slug` (an old one in its `replaced_slugs`
 * included): the app draws every successful result as a card, so a card for
 * no Exercise must fail the call rather than answer an error.
 */
const requireKnownExercise = async (slug: string): Promise<void> => {
  const answer = await getLibrary().get();

  if (answer.status === "unavailable") {
    throw new Error(
      "The exercise library is unavailable right now, so no card was shown. Try again in a moment."
    );
  }

  if (answer.library.checkSlugs([slug]).unknown.length > 0) {
    throw new Error(
      `Unknown exercise_slug: ${slug}. Use search_exercises to find a valid exercise_slug; no card was shown.`
    );
  }
};

export const tool = defineTool({
  description:
    "Show the user a card of their history of one exercise: their most recent sessions with it and their best result, read from their data (the same numbers get_exercise_history answers). Use it when the user asks how an exercise is going. An exercise they haven't logged still shows as a card saying so.",
  async execute({ exercise_slug }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    await requireKnownExercise(exercise_slug);

    return await readExerciseHistory(userId, {
      exerciseSlug: exercise_slug,
      language: appLanguage(ctx.messages),
      limit: DEFAULT_HISTORY_ENTRIES,
    });
  },
  inputSchema: z.object({
    exercise_slug: exerciseSlugSchema.describe(
      "The exercise's exercise_slug, as search_exercises, the plan or the workout history returns it"
    ),
  }),
});

export default offeredForCard("exercise_history", tool);
