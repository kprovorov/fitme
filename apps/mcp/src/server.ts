import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createToolContext,
  type ToolContext,
  type ToolContextOptions,
} from "./context.js";
import { PUBLIC_TOOL_NAMES, registerCatalogTools } from "./tools/catalog.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerSessionTools } from "./tools/sessions.js";

export const SERVER_NAME = "fitme";
export const SERVER_VERSION = "0.2.0";

/** Tools that act on the signed-in user's data (see `PUBLIC_TOOL_NAMES`). */
export const USER_TOOL_NAMES: readonly string[] = [
  "list_exercises",
  "get_exercise",
  "get_exercise_history",
  "list_plans",
  "get_plan",
  "create_plan",
  "update_plan",
  "delete_plan",
  "activate_plan",
  "start_workout_session",
  "get_workout_session",
  "list_workout_sessions",
  "log_set",
  "finish_workout_session",
  "delete_workout_session",
  "get_profile",
];

const INSTRUCTIONS = `Fitme is a strength-training app. Catalog tools (${PUBLIC_TOOL_NAMES.join(", ")}) are public. Every other tool acts on the signed-in user's own data and needs the connection to be signed in (OAuth, or an \`Authorization: Bearer <Supabase access token>\` header).
Typical flow: get_profile (units) -> list_exercises -> create_plan -> get_plan -> start_workout_session(workoutId) -> log_set(setId, ...) for each set -> finish_workout_session.
Weights are in the user's unit (kg for metric, lbs for us/uk) and are never converted.`;

export interface CreateMcpServerOptions extends ToolContextOptions {
  /** A context the caller already built (and may have authenticated). */
  context?: ToolContext;
}

/**
 * Builds a fresh MCP server. The HTTP transport runs stateless, so a new
 * instance is created for every request, carrying that request's access token
 * (or the `context` the HTTP layer already resolved from it).
 * `createSupabaseClient` can be injected (e.g. in tests); it defaults to a
 * client built from SUPABASE_URL / SUPABASE_ANON_KEY.
 */
export function createMcpServer(
  options: CreateMcpServerOptions = {}
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS }
  );
  const ctx = options.context ?? createToolContext(options);

  registerCatalogTools(server, { name: SERVER_NAME, version: SERVER_VERSION });
  registerExerciseTools(server, ctx);
  registerPlanTools(server, ctx);
  registerSessionTools(server, ctx);
  registerProfileTools(server, ctx);

  return server;
}
