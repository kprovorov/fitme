import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createToolContext, type ToolContextOptions } from "./context.js";
import { registerCatalogTools } from "./tools/catalog.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerSessionTools } from "./tools/sessions.js";

export const SERVER_NAME = "fitme";
export const SERVER_VERSION = "0.2.0";

const INSTRUCTIONS = `Fitme is a strength-training app. Catalog tools (ping, list_muscle_groups, list_plan_options, describe_muscle_group) are public. Every other tool acts on the signed-in user's own data and needs an \`Authorization: Bearer <Supabase access token>\` header on the connection.
Typical flow: get_profile (units) -> list_exercises -> create_plan -> get_plan -> start_workout_session(workoutId) -> log_set(setId, ...) for each set -> finish_workout_session.
Weights are in the user's unit (kg for metric, lbs for us/uk) and are never converted.`;

export type CreateMcpServerOptions = ToolContextOptions;

/**
 * Builds a fresh MCP server. The HTTP transport runs stateless, so a new
 * instance is created for every request, carrying that request's access token.
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
  const ctx = createToolContext(options);

  registerCatalogTools(server, { name: SERVER_NAME, version: SERVER_VERSION });
  registerExerciseTools(server, ctx);
  registerPlanTools(server, ctx);
  registerSessionTools(server, ctx);
  registerProfileTools(server, ctx);

  return server;
}
