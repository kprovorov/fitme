import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";
import { registerCatalogTools } from "./tools/catalog.js";
import { registerExerciseTools } from "./tools/exercises.js";
import { registerPlanTools } from "./tools/plans.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerSessionTools } from "./tools/sessions.js";

export const SERVER_NAME = "fitme";
export const SERVER_VERSION = "0.2.0";

const INSTRUCTIONS = `Fitme is a strength-training app. Catalog tools describe muscle groups and plan options; every other tool acts on the signed-in user's own data.
Typical flow: get_profile (units) -> list_exercises -> create_plan -> get_plan -> start_workout_session(workoutId) -> log_set(setId, ...) for each set -> finish_workout_session.
Weights are in the user's unit (kg for metric, lbs for us/uk) and are never converted.`;

export interface CreateMcpServerOptions {
  /** The request's caller; the HTTP layer builds it from a verified token. */
  context: ToolContext;
}

/**
 * Builds a fresh MCP server. The HTTP transport runs stateless, so a new
 * instance is created for every request, carrying that request's caller.
 */
export function createMcpServer({
  context: ctx,
}: CreateMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS }
  );

  registerCatalogTools(server, { name: SERVER_NAME, version: SERVER_VERSION });
  registerExerciseTools(server, ctx);
  registerPlanTools(server, ctx);
  registerSessionTools(server, ctx);
  registerProfileTools(server, ctx);

  return server;
}
