import { defineTool } from "eve/tools";
import { z } from "zod";

import { exerciseSlugSchema } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";
import { offeredForCard } from "../lib/tool-offer";

/** The most Exercises one card lists. */
export const MAX_SHOWN_EXERCISES = 8;

/**
 * The Exercise card (ADR 0027), one Exercise or a list: answers the
 * Exercises' own slugs in the Library, in the order asked, an old slug as
 * the Exercise replacing it, so the app draws each one as it is now. Writes
 * nothing. A refusal is a thrown tool error, never an `{ error }` result: the
 * app draws every successful result as a card.
 */
export const tool = defineTool({
  description: `Show the user one or more exercises (up to ${MAX_SHOWN_EXERCISES}) as cards in the chat, each with its thumbnail, name, muscle groups, equipment and difficulty, opening the exercise's guide on tap. Pass exercise_slug values from search_exercises or from a plan or workout session you read; the card shows each exercise as the library has it, so don't repeat its details in your answer.`,
  async execute({ exercise_slugs }, ctx) {
    requireConversationOwner(ctx.session.auth);

    const answer = await getLibrary().get();

    if (answer.status === "unavailable") {
      throw new Error(
        "The exercise library is unavailable right now, so no exercise can be shown. Try again in a moment, or answer in text."
      );
    }

    const { known, unknown } = answer.library.checkSlugs(exercise_slugs);

    if (unknown.length > 0) {
      throw new Error(
        `Unknown exercise_slug(s): ${unknown.join(", ")}. Use search_exercises to find a valid exercise_slug, then show it.`
      );
    }

    // Two slugs asked for can be one Exercise (an old slug and its
    // replacement), which the card shows once
    return {
      exercise_slugs: [
        ...new Set(known.map(({ exercise_slug }) => exercise_slug)),
      ],
    };
  },
  inputSchema: z.object({
    exercise_slugs: z
      .array(exerciseSlugSchema)
      .min(1)
      .max(MAX_SHOWN_EXERCISES)
      .describe(
        "The exercise_slug of each exercise to show, in the order to show them"
      ),
  }),
});

export default offeredForCard("exercises", tool);
