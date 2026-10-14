import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import { asJson, READ_ONLY, requireFound, withServices } from "./helpers.js";

export function registerProfileTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "get_profile",
    {
      annotations: READ_ONLY,
      description:
        "Returns the authenticated user's profile: gender, age, height, weight and measurement_system, plus the `units` every weight/height in Fitme is expressed in (metric = kg/cm, us/uk = lbs/in). Use it to tailor plans and to interpret or enter weights.",
      inputSchema: {},
      title: "Get profile",
    },
    withServices(ctx, async (_args, services) =>
      asJson(
        requireFound(
          await services.getProfile(),
          "No profile found: the user has not completed onboarding in the Fitme app yet."
        )
      )
    )
  );
}
