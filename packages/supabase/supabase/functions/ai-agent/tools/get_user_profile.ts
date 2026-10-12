import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createGetUserProfileTool({ supabase, userId }: UserContext) {
  return tool({
    description:
      "Get the user's profile including age, gender, height, weight, and preferred measurement system",
    execute: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("gender, age, height, weight, measurement_system")
        .eq("user_id", userId)
        .single();
      if (error) {
        return { error: "Profile not found" };
      }
      return data;
    },
    inputSchema: z.object({}),
  });
}
