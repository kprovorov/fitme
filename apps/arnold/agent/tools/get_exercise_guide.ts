import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { exerciseSlugSchema, libraryUnavailable } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Read an exercise's guide from the exercise library: its name, a short description, the steps to perform it and its common mistakes, in the app language. Use it when the user asks how to do an exercise or about its form, and base the advice on it.",
  async execute({ exercise_slug }, ctx) {
    requireConversationOwner(ctx.session.auth);

    const answer = await getLibrary().get();

    if (answer.status === "unavailable") {
      return libraryUnavailable("the guide couldn't be read");
    }

    // An old slug answers the Exercise replacing it.
    const exercise = answer.library.get(exercise_slug, {
      language: appLanguage(ctx.messages),
    });

    if (exercise === null) {
      return {
        error: `Unknown exercise_slug: ${exercise_slug}. Use search_exercises to find a valid exercise_slug.`,
      };
    }

    return {
      common_mistakes: exercise.common_mistakes,
      exercise_slug: exercise.slug,
      name: exercise.name,
      short_description: exercise.short_description,
      steps: exercise.steps,
    };
  },
  inputSchema: z.object({
    exercise_slug: exerciseSlugSchema.describe(
      "The exercise's exercise_slug, as search_exercises or the plan returns it"
    ),
  }),
});
