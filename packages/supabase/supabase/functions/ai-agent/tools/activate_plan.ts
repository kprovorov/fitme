import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createActivatePlanTool({ supabase }: SupabaseContext) {
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
