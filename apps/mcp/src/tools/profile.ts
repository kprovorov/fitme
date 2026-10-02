import {
  getWeightLabel,
  type MeasurementSystem,
  measurementSystems,
} from "@fitme/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../context.js";
import {
  asJson,
  READ_ONLY,
  requireFound,
  unwrap,
  withUser,
} from "./helpers.js";

const isKnownSystem = (value: string): value is MeasurementSystem =>
  measurementSystems.some((system) => system === value);

/** Height is stored in cm (metric) or inches (us/uk); weight in kg or lbs. */
const unitsFor = (measurementSystem: string) => {
  const system = isKnownSystem(measurementSystem)
    ? measurementSystem
    : "metric";
  return {
    height: system === "metric" ? "cm" : "in",
    weight: getWeightLabel(system),
  };
};

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
    withUser(ctx, async (_args, { supabase, userId }) => {
      const profile = requireFound(
        unwrap(
          await supabase
            .from("profiles")
            .select("gender, age, height, weight, measurement_system")
            .eq("user_id", userId)
            .maybeSingle()
        ),
        "No profile found: the user has not completed onboarding in the Fitme app yet."
      );
      return asJson({
        ...profile,
        units: unitsFor(profile.measurement_system),
      });
    })
  );
}
