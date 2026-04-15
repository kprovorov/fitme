import { tool } from "npm:ai";
import { z } from "npm:zod";
import { ToolContext } from "./types.ts";

export function createGetPlansTool({ supabaseClient, log }: ToolContext) {
  return tool({
    description:
      "List all workout plans for the user with their names, goals, and active status",
    inputSchema: z.object({}),
    execute: async () => {
      log("tool_call", { tool: "get_plans" });
      const { data, error } = await supabaseClient
        .from("plans")
        .select(
          "id, name, description, goal, place, frequency, is_active, created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        log("tool_error", { tool: "get_plans", error: error.message });
        return { error: "Failed to fetch plans" };
      }
      log("tool_ok", { tool: "get_plans", count: data?.length ?? 0 });
      return data ?? [];
    },
  });
}
