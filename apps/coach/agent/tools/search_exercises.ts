import { muscleGroups } from "@fitme/core/models";
import { ExerciseLibraryError } from "@fitme/exercise-library";
import { reportError } from "@fitme/observability/node";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { exerciseLibrary } from "../lib/exercise-library";
import { requireConversationOwner } from "../lib/owner";

const MAX_RESULTS = 8;

export default defineTool({
  description:
    "Search the exercise library by name or muscle group. Returns each exercise's exercise_slug, the only way to refer to an exercise in other tools.",
  async execute({ muscle_group, query }, ctx) {
    requireConversationOwner(ctx.session.auth);
    try {
      const page = await exerciseLibrary().list({
        limit: MAX_RESULTS,
        muscleGroup: muscle_group,
        search: query,
      });
      return page.data.map(({ muscle_groups, name, slug }) => ({
        exercise_slug: slug,
        muscle_groups,
        name,
      }));
    } catch (error) {
      if (!(error instanceof ExerciseLibraryError)) {
        throw error;
      }
      await reportError(error, { exercise_library: "search" });
      return {
        error:
          "The exercise library is unavailable right now. Try again in a moment.",
      };
    }
  },
  inputSchema: z.object({
    muscle_group: z
      .enum(muscleGroups)
      .optional()
      .describe(`Filter by muscle group: ${muscleGroups.join(", ")}`),
    query: z
      .string()
      .max(100)
      .optional()
      .describe("Part of the exercise name to search for"),
  }),
});
