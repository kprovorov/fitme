import { muscleGroups } from "@fitme/core";
import type { ExercisePage } from "@fitme/exercise-library";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import { fromLibrary } from "./exercise-library.js";
import {
  asJson,
  READ_ONLY,
  requireFound,
  WEIGHT_UNIT_NOTE,
  withServices,
  withToolErrors,
} from "./helpers.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./limits.js";
import { exerciseSlugSchema } from "./plan-schemas.js";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;
/** The Exercise Library API's largest page; a bigger one takes two requests. */
const LIBRARY_PAGE_SIZE = 50;

export function registerExerciseTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_exercises",
    {
      annotations: READ_ONLY,
      description:
        "Searches the Fitme Exercise Library (alphabetical, paginated). Use an Exercise's `slug` as `exercise_slug` when building plans with create_plan / update_plan. Returns compact rows (slug, name, muscle groups, thumbnail and video URLs) plus `total` and `hasMore`; an offset past the end returns an empty page. Call get_exercise for the description and instructions.",
      inputSchema: {
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
          .describe("Only exercises that target this muscle group."),
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
          .describe("Case-insensitive substring of the exercise name."),
      },
      title: "List exercises",
    },
    withToolErrors(ctx, async ({ limit, muscleGroup, offset, search }) => {
      // the API pages by at most 50, so a bigger page is read in parts
      const parts = Array.from(
        { length: Math.ceil(limit / LIBRARY_PAGE_SIZE) },
        (_, i) => ({
          limit: Math.min(LIBRARY_PAGE_SIZE, limit - i * LIBRARY_PAGE_SIZE),
          offset: offset + i * LIBRARY_PAGE_SIZE,
        })
      );
      const pages = await fromLibrary(ctx, (library) =>
        Promise.all(
          parts.map((part) => library.list({ ...part, muscleGroup, search }))
        )
      );
      const exercises = pages.flatMap((page) => page.data);
      const [{ total }] = pages as [ExercisePage, ...ExercisePage[]];
      return asJson({
        exercises,
        hasMore: offset + exercises.length < total,
        limit,
        offset,
        total,
      });
    })
  );

  server.registerTool(
    "get_exercise",
    {
      annotations: READ_ONLY,
      description:
        "Returns one Exercise from the Exercise Library by its slug, with its full details (description and instructions in markdown, video and thumbnail URLs, muscle groups).",
      inputSchema: { exerciseSlug: exerciseSlugSchema },
      title: "Get exercise",
    },
    withToolErrors(ctx, async ({ exerciseSlug }) =>
      asJson(
        requireFound(
          await fromLibrary(ctx, (library) => library.get(exerciseSlug)),
          `Exercise ${exerciseSlug} not found. Use list_exercises to look up valid Exercise slugs.`
        )
      )
    )
  );

  server.registerTool(
    "get_exercise_history",
    {
      annotations: READ_ONLY,
      description: `Returns the authenticated user's logged sets for one exercise (by its Exercise slug), newest first. There is one entry per time the exercise appeared in a workout session (normally one per session; more if it was added to the same session twice), each with the session, workout and plan it belongs to. Only sets with a logged weight are included, and entries without any are skipped. \`limit\` counts entries. ${WEIGHT_UNIT_NOTE}`,
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
    withServices(ctx, async ({ exerciseSlug, limit }, services) =>
      asJson({
        entries: await services.getExerciseHistory({ exerciseSlug, limit }),
        exerciseSlug,
      })
    )
  );
}
