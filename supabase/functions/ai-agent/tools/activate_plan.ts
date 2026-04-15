import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { ToolContext } from "./types.ts";

export function createActivatePlanTool({ supabaseClient, log }: ToolContext) {
  return tool({
    description: "Set a specific plan as the user's active plan",
    inputSchema: z.object({
      plan_id: z.string().describe("The ID of the plan to activate"),
    }),
    execute: async ({ plan_id }) => {
      log("tool_call", { tool: "activate_plan", plan_id });
      const { error } = await supabaseClient.rpc("activate_plan", {
        plan_id,
      });
      if (error) {
        log("tool_error", { tool: "activate_plan", error: error.message });
        return { error: "Failed to activate plan" };
      }
      log("tool_ok", { tool: "activate_plan", plan_id });
      return { success: true, plan_id };
    },
  });
}
