import { muscleGroups } from "@fitme/core/models";
import { asUser } from "@fitme/db";
import { listExercises } from "@fitme/services/exercises";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";

const MAX_RESULTS = 8;

export default defineTool({
  description:
    "Search for exercises in the exercise library by name or muscle group",
  async execute({ muscle_group, query }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const page = await asUser(userId, (tx) =>
      listExercises(tx, {
        limit: MAX_RESULTS,
        muscleGroup: muscle_group,
        offset: 0,
        search: query,
      })
    );
    return page.exercises.map(({ id, muscle_groups, name }) => ({
      id,
      muscle_groups,
      name,
    }));
  },
  inputSchema: z.object({
    muscle_group: z
      .enum(muscleGroups)
      .optional()
      .describe(`Filter by muscle group: ${muscleGroups.join(", ")}`),
    query: z
      .string()
      .optional()
      .describe("Part of the exercise name to search for"),
  }),
});
