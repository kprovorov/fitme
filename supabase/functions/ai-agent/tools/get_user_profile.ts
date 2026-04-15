import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { ToolContext } from "./types.ts";

export function createGetUserProfileTool({ supabaseClient, log }: ToolContext) {
  return tool({
    description:
      "Get the user's profile including age, gender, height, weight, and preferred measurement system",
    inputSchema: z.object({}),
    execute: async () => {
      log("tool_call", { tool: "get_user_profile" });
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        log("tool_error", { tool: "get_user_profile", error: "auth failed" });
        return { error: "Could not identify user" };
      }
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("gender, age, height, weight, measurement_system")
        .eq("user_id", user.id)
        .single();
      if (error) {
        log("tool_error", { tool: "get_user_profile", error: error.message });
        return { error: "Profile not found" };
      }
      log("tool_ok", { tool: "get_user_profile" });
      return data;
    },
  });
}
