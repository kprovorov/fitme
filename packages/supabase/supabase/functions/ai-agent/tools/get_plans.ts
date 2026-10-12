import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createGetPlansTool({ supabase }: UserContext) {
  return tool({
    description:
      "List all workout plans for the user with their names, goals, and active status",
    execute: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          "id, name, description, goal, place, frequency, is_active, created_at"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        return { error: "Failed to fetch plans" };
      }
      return data ?? [];
    },
    inputSchema: z.object({}),
  });
}
