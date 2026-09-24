import {
  experienceLevels,
  getExperienceLevelLabel,
  getGoalLabel,
  getPlaceLabel,
  goals,
  muscleGroups,
  muscleGroupToName,
  places,
} from "@fitme/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const SERVER_NAME = "fitme";
export const SERVER_VERSION = "0.1.0";

const asJson = (value: unknown) => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" as const }],
});

/**
 * Builds a fresh MCP server. The HTTP transport runs stateless, so a new
 * instance is created for every request.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "ping",
    {
      description: "Health check that returns the server name and version.",
      inputSchema: {},
      title: "Ping",
    },
    () => asJson({ name: SERVER_NAME, ok: true, version: SERVER_VERSION })
  );

  server.registerTool(
    "list_muscle_groups",
    {
      description: "Lists every muscle group Fitme exercises can target.",
      inputSchema: {},
      title: "List muscle groups",
    },
    () =>
      asJson(muscleGroups.map((id) => ({ id, name: muscleGroupToName(id) })))
  );

  server.registerTool(
    "list_plan_options",
    {
      description:
        "Lists the goals, training places and experience levels a Fitme plan can be generated with.",
      inputSchema: {},
      title: "List plan options",
    },
    () =>
      asJson({
        experienceLevels: experienceLevels.map((id) => ({
          id,
          label: getExperienceLevelLabel(id),
        })),
        goals: goals.map((id) => ({ id, label: getGoalLabel(id) })),
        places: places.map((id) => ({ id, label: getPlaceLabel(id) })),
      })
  );

  server.registerTool(
    "describe_muscle_group",
    {
      description: "Returns the display name for a muscle group id.",
      inputSchema: { muscleGroup: z.enum(muscleGroups) },
      title: "Describe muscle group",
    },
    ({ muscleGroup }) =>
      asJson({ id: muscleGroup, name: muscleGroupToName(muscleGroup) })
  );

  return server;
}
