import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createActivatePlanTool({ supabase }: UserContext) {
  return tool({
    description: "Set a specific plan as the user's active plan",
    execute: async ({ plan_id }) => {
      const { error } = await supabase.rpc("activate_plan", {
        plan_id,
      });
      if (error) {
        return { error: "Failed to activate plan" };
      }
      return { plan_id, success: true };
    },
    inputSchema: z.object({
      plan_id: z.string().describe("The ID of the plan to activate"),
    }),
  });
}
