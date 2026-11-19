import { equipment as equipmentList, muscleGroups } from "@fitme/core/models";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { libraryUnavailable } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";

const MAX_RESULTS = 8;

/** The longest search the tool takes. */
const MAX_SEARCH_LENGTH = 100;

export default defineTool({
  description:
    "Search the exercise library by name, muscle group or equipment. Returns each exercise's exercise_slug, the only way to refer to an exercise in other tools, the equipment it needs, its movement patterns and its difficulty.",
  async execute({ equipment, muscle_group, query }, ctx) {
    requireConversationOwner(ctx.session.auth);

    const answer = await getLibrary().get();

    if (answer.status === "unavailable") {
      return libraryUnavailable("the search failed");
    }

    const page = answer.library.list({
      equipment,
      language: appLanguage(ctx.messages),
      limit: MAX_RESULTS,
      muscleGroups: muscle_group ? [muscle_group] : undefined,
      search: query,
    });

    return page.data.map(
      ({
        difficulty,
        equipment: needs,
        movement_patterns,
        muscle_groups,
        name,
        slug,
      }) => ({
        difficulty,
        equipment: needs,
        exercise_slug: slug,
        movement_patterns,
        muscle_groups,
        name,
      })
    );
  },
  inputSchema: z.object({
    equipment: z
      .array(z.enum(equipmentList))
      .optional()
      .describe(
        `Only exercises using any of this equipment: ${equipmentList.join(", ")}. When the user says what they have, add bodyweight to the list so exercises needing no equipment are included too, and pull_up_bar only when the user has one. An exercise matches when it needs any of the listed equipment, so check each result's equipment and skip one needing gear the user hasn't got (pull-ups need bodyweight and pull_up_bar).`
      ),
    muscle_group: z
      .enum(muscleGroups)
      .optional()
      .describe(
        `Only exercises with this primary muscle group: ${muscleGroups.join(", ")}`
      ),
    query: z
      .string()
      .max(MAX_SEARCH_LENGTH)
      .optional()
      .describe(
        "Part of the exercise name (or one of its other English names) to search for"
      ),
  }),
});
