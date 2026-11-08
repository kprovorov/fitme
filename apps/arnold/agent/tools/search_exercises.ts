import { equipment as equipmentList, muscleGroups } from "@fitme/core/models";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { libraryLanguage } from "../lib/client-context";
import { libraryUnavailable, onLibraryFailure } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";

const MAX_RESULTS = 8;

/** The Library API's limit on `search`. */
const MAX_SEARCH_LENGTH = 100;

export default defineTool({
  description:
    "Search the exercise library by name, muscle group or equipment. Returns each exercise's exercise_slug, the only way to refer to an exercise in other tools, and the equipment it needs.",
  async execute({ equipment, muscle_group, query }, ctx) {
    requireConversationOwner(ctx.session.auth);

    try {
      const page = await getLibrary().list({
        equipment,
        language: libraryLanguage(ctx.messages),
        limit: MAX_RESULTS,
        muscleGroup: muscle_group,
        search: query,
      });

      return page.data.map(
        ({ equipment: needs, muscle_groups, name, slug }) => ({
          equipment: needs,
          exercise_slug: slug,
          muscle_groups,
          name,
        })
      );
    } catch (error) {
      return await onLibraryFailure(
        error,
        "search",
        libraryUnavailable("the search failed")
      );
    }
  },
  inputSchema: z.object({
    equipment: z
      .array(z.enum(equipmentList))
      .optional()
      .describe(
        `Only exercises using any of this equipment: ${equipmentList.join(", ")}. When the user says what they have, add bodyweight to the list so exercises needing no equipment are included too.`
      ),
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
