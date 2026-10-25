import { muscleGroups } from "@fitme/core/models";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { libraryUnavailable, onLibraryFailure } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";

const MAX_RESULTS = 8;
/** The Library API's limit on `search`. */
const MAX_SEARCH_LENGTH = 100;

export default defineTool({
  description:
    "Search the exercise library by name or muscle group. Returns each exercise's exercise_slug, the only way to refer to an exercise in other tools.",
  async execute({ muscle_group, query }, ctx) {
    requireConversationOwner(ctx.session.auth);
    try {
      const page = await getLibrary().list({
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
      return await onLibraryFailure(
        error,
        "search",
        libraryUnavailable("the search failed")
      );
    }
  },
  inputSchema: z.object({
    muscle_group: z
      .enum(muscleGroups)
      .optional()
      .describe(`Filter by muscle group: ${muscleGroups.join(", ")}`),
    query: z
      .string()
      .max(MAX_SEARCH_LENGTH)
      .optional()
      .describe("Part of the exercise name to search for"),
  }),
});
