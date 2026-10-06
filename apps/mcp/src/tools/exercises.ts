import { muscleGroups } from "@fitme/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import {
  asJson,
  byOrder,
  fetchPage,
  READ_ONLY,
  requireFound,
  unwrap,
  WEIGHT_UNIT_NOTE,
  withUser,
} from "./helpers.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./limits.js";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

/** Matches `search` anywhere in the name, treating `%` and `_` literally. */
export const toContainsPattern = (search: string) =>
  `%${search.replace(LIKE_SPECIAL_CHARACTERS, "\\$&")}%`;

const EXERCISE_SUMMARY_SELECT = "id, name, slug, muscle_groups, description";

const HISTORY_SELECT = `
  id,
  created_at,
  sets:workout_session_exercise_sets!inner (
    id, order, reps_completed, weight_completed, logged_at
  ),
  session:workout_sessions!inner (
    id, started_at, finished_at,
    workout:workouts ( id, name ),
    plan:plans ( id, name )
  )
`;

const exerciseIdSchema = z
  .string()
  .uuid()
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
    withUser(
      ctx,
      async ({ limit, muscleGroup, offset, search }, { supabase }) => {
        const query = (head: boolean) => {
          let filtered = supabase
            .from("exercises")
            .select(EXERCISE_SUMMARY_SELECT, { count: "exact", head });
          if (search) {
            filtered = filtered.ilike("name", toContainsPattern(search));
          }
          if (muscleGroup) {
            filtered = filtered.contains(
              "muscle_groups",
              JSON.stringify([muscleGroup])
            );
          }
          return filtered;
        };

        const { rows, ...page } = await fetchPage(
          () =>
            query(false)
              .order("name")
              .order("id")
              .range(offset, offset + limit - 1),
          () => query(true),
          { limit, offset }
        );
        return asJson({ exercises: rows, ...page });
      }
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
    withUser(ctx, async ({ exerciseId }, { supabase }) => {
      const exercise = unwrap(
        await supabase
          .from("exercises")
          .select("*")
          .eq("id", exerciseId)
          .maybeSingle()
      );
      return asJson(
        requireFound(exercise, `Exercise ${exerciseId} not found.`)
      );
    })
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
    withUser(ctx, async ({ exerciseId, limit }, { supabase }) => {
      const rows = unwrap(
        await supabase
          .from("workout_session_exercises")
          .select(HISTORY_SELECT)
          .eq("exercise_id", exerciseId)
          .not("sets.weight_completed", "is", null)
          .order("created_at", { ascending: false })
          .limit(limit)
      );

      return asJson({
        entries: rows.map(({ id, session, sets }) => ({
          finished_at: session.finished_at,
          plan: session.plan,
          session_exercise_id: id,
          session_id: session.id,
          sets: byOrder(sets),
          started_at: session.started_at,
          workout: session.workout,
        })),
        exerciseId,
      });
    })
  );
}
