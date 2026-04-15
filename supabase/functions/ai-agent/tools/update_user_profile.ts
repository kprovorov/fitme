import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { ToolContext } from "./types.ts";

export function createUpdateUserProfileTool({
  supabaseClient,
  log,
}: ToolContext) {
  return tool({
    description:
      "Update the user's profile. All fields are optional — only provide the fields that need to change.",
    inputSchema: z.object({
      gender: z.enum(["male", "female"]).optional(),
      age: z.number().int().min(10).max(120).optional(),
      height: z.number().positive().optional(),
      weight: z.number().positive().optional(),
      measurement_system: z.enum(["metric", "us", "uk"]).optional(),
    }),
    execute: async (input) => {
      log("tool_call", { tool: "update_user_profile", input });
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        log("tool_error", {
          tool: "update_user_profile",
          error: "auth failed",
        });
        return { error: "Could not identify user" };
      }
      try {
        const { data: existing, error: fetchError } = await supabaseClient
          .from("profiles")
          .select("gender, age, height, weight, measurement_system")
          .eq("user_id", user.id)
          .single();
        if (fetchError) {
          throw fetchError;
        }

        const { data, error } = await supabaseClient
          .from("profiles")
          .upsert(
            { ...existing, ...input, user_id: user.id },
            { onConflict: "user_id" }
          )
          .select("gender, age, height, weight, measurement_system")
          .single();
        if (error) {
          throw error;
        }
        log("tool_ok", { tool: "update_user_profile" });
        return { success: true, profile: data };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object"
              ? JSON.stringify(err)
              : String(err);
        log("tool_error", { tool: "update_user_profile", error: message });
        return { error: `Failed to update profile: ${message}` };
      }
    },
  });
}
