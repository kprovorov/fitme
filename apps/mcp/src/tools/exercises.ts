import { equipment as equipmentIds, muscleGroups } from "@fitme/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ToolContext } from "../context.js";
import {
  asJson,
  READ_ONLY,
  requireFound,
  WEIGHT_UNIT_NOTE,
  withServices,
  withToolErrors,
} from "./helpers.js";
import { exerciseSlugSchema, requireLibrary } from "./library.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./limits.js";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

export const registerExerciseTools = (server: McpServer, ctx: ToolContext) => {
  server.registerTool(
    "list_exercises",
    {
      annotations: READ_ONLY,
      description:
        "Searches the Fitme Library (alphabetical, paginated). Use an Exercise's `slug` as `exercise_slug` when building plans with create_plan / update_plan. Returns compact rows (slug, name, primary `muscle_groups` and `secondary_muscle_groups`, the Equipment it needs, its `movement_patterns` and `difficulty`, thumbnail and video URLs) plus `total` and `hasMore`; an offset past the end returns an empty page. `search` matches the name or one of the Exercise's other names (e.g. `RDL`). `muscleGroup` matches a primary muscle group only. `equipment` narrows the list to exercises using **any** of the given Equipment (so pass every piece the user has: `bodyweight` included, and `pull_up_bar` when they have one, since pull-ups need it), and `search`, `muscleGroup` and `equipment` narrow it together. Call get_exercise for the descriptions, steps, common mistakes and benefits.",
      inputSchema: {
        equipment: z
          .array(z.enum(equipmentIds))
          .max(equipmentIds.length)
          .optional()
          .describe(
            "Only exercises that use any of this Equipment; an empty list narrows nothing. `bodyweight` means the body is the load."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe(
            `Page size (default ${DEFAULT_PAGE_SIZE}, max ${MAX_PAGE_SIZE}).`
          ),
        muscleGroup: z
          .enum(muscleGroups)
          .optional()
          .describe(
            "Only exercises that target this muscle group as a primary one."
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Number of rows to skip, for pagination."),
        search: z
          .string()
          .trim()
          .min(1)
          .max(MAX_SEARCH_LENGTH)
          .optional()
          .describe(
            "Case-insensitive substring of the exercise's name or one of its other names."
          ),
      },
      title: "List exercises",
    },
    withToolErrors(
      ctx,
      async ({ equipment, limit, muscleGroup, offset, search }) => {
        const library = await requireLibrary(ctx);

        const { data, hasMore, total } = library.list({
          equipment,
          limit,
          muscleGroups: muscleGroup ? [muscleGroup] : undefined,
          offset,
          search,
        });

        return asJson({ exercises: data, hasMore, limit, offset, total });
      }
    )
  );

  server.registerTool(
    "get_exercise",
    {
      annotations: READ_ONLY,
      description:
        "Returns one Exercise from the Library by its slug, with its full details: the summary list_exercises gives (muscle groups, Equipment as ids, movement patterns, difficulty, thumbnail and video URLs; call list_equipment and list_muscle_groups for their names), plus `short_description`, `long_description`, the numbered `steps`, the `common_mistakes` and the `benefits`. A slug an Exercise had in the old Library answers the Exercise replacing it, under its own `slug`.",
      inputSchema: { exerciseSlug: exerciseSlugSchema },
      title: "Get exercise",
    },
    withToolErrors(ctx, async ({ exerciseSlug }) => {
      const library = await requireLibrary(ctx);

      return asJson(
        requireFound(
          library.get(exerciseSlug),
          `Exercise ${exerciseSlug} not found. Use list_exercises to look up valid Exercise slugs.`
        )
      );
    })
  );

  server.registerTool(
    "get_exercise_history",
    {
      annotations: READ_ONLY,
      description: `Returns the authenticated user's logged sets for one exercise (by its Exercise slug), newest workout session first. There is one entry per time the exercise appeared in a workout session (normally one per session; more if it was added to the same session twice), each with the session, workout and plan it belongs to. A set is included once its reps are logged, bodyweight sets included (those log no weight, so \`weight_completed\` is null); a set that was never logged is left out, and an entry left with no set is skipped. Each set also carries the targets it was given (\`reps_recommended\`, \`weight_recommended\`), both null for a set added during the session. \`limit\` counts entries, and \`total\` is how many the user has. ${WEIGHT_UNIT_NOTE}`,
      inputSchema: {
        exerciseSlug: exerciseSlugSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_HISTORY_LIMIT)
          .default(DEFAULT_HISTORY_LIMIT)
          .describe(
            `Maximum number of entries (default ${DEFAULT_HISTORY_LIMIT}, max ${MAX_HISTORY_LIMIT}).`
          ),
      },
      title: "Get exercise history",
    },
    withServices(ctx, async ({ exerciseSlug, limit }, services) => {
      const { entries, total } = await services.getExerciseHistory({
        exerciseSlug,
        limit,
        offset: 0,
      });

      return asJson({ entries, exerciseSlug, total });
    })
  );
};
