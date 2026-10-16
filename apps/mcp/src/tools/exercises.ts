import { muscleGroups } from "@fitme/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import {
  asJson,
  READ_ONLY,
  requireFound,
  WEIGHT_UNIT_NOTE,
  withServices,
} from "./helpers.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./limits.js";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

const exerciseIdSchema = z
  .guid()
  .describe("Exercise library id (exercises.id).");

export function registerExerciseTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "list_exercises",
    {
      annotations: READ_ONLY,
      description:
        "Searches the Fitme exercise library (alphabetical, paginated). Use the returned `id` as `exercise_id` when building plans with create_plan / update_plan. Returns compact rows plus `total` and `hasMore`; an offset past the end returns an empty page. Call get_exercise for instructions and media.",
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
    withServices(ctx, async (query, services) =>
      asJson(await services.listExercises(query))
    )
  );

  server.registerTool(
    "get_exercise",
    {
      annotations: READ_ONLY,
      description:
        "Returns one exercise from the library with its full details (description, instructions, video and thumbnail URLs, muscle groups).",
      inputSchema: { exerciseId: exerciseIdSchema },
      title: "Get exercise",
    },
    withServices(ctx, async ({ exerciseId }, services) =>
      asJson(
        requireFound(
          await services.getExercise(exerciseId),
          `Exercise ${exerciseId} not found.`
        )
      )
    )
  );

  server.registerTool(
    "get_exercise_history",
    {
      annotations: READ_ONLY,
      description: `Returns the authenticated user's logged sets for one exercise, newest first. There is one entry per time the exercise appeared in a workout session (normally one per session; more if it was added to the same session twice), each with the session, workout and plan it belongs to. Only sets with a logged weight are included, and entries without any are skipped. \`limit\` counts entries. ${WEIGHT_UNIT_NOTE}`,
      inputSchema: {
        exerciseId: exerciseIdSchema,
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
    withServices(ctx, async ({ exerciseId, limit }, services) =>
      asJson({
        entries: await services.getExerciseHistory({ exerciseId, limit }),
        exerciseId,
      })
    )
  );
}
