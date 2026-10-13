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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asJson, READ_ONLY } from "./helpers.js";

interface ServerInfo {
  name: string;
  version: string;
}

/** Static catalog tools backed by `@fitme/core`; they read no User data. */
export function registerCatalogTools(server: McpServer, info: ServerInfo) {
  server.registerTool(
    "ping",
    {
      annotations: READ_ONLY,
      description: "Health check that returns the server name and version.",
      inputSchema: {},
      title: "Ping",
    },
    () => asJson({ name: info.name, ok: true, version: info.version })
  );

  server.registerTool(
    "list_muscle_groups",
    {
      annotations: READ_ONLY,
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
      annotations: READ_ONLY,
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
      annotations: READ_ONLY,
      description: "Returns the display name for a muscle group id.",
      inputSchema: { muscleGroup: z.enum(muscleGroups) },
      title: "Describe muscle group",
    },
    ({ muscleGroup }) =>
      asJson({ id: muscleGroup, name: muscleGroupToName(muscleGroup) })
  );
}
