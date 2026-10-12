import { tool } from "npm:ai";
import { z } from "npm:zod";
import type { UserContext } from "../../_shared/clerk-auth.ts";

export function createUpdateUserProfileTool({ supabase, userId }: UserContext) {
  return tool({
    description:
      "Update the user's profile. All fields are optional — only provide the fields that need to change.",
    execute: async (input) => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from("profiles")
          .select("gender, age, height, weight, measurement_system")
          .eq("user_id", userId)
          .single();
        if (fetchError) {
          throw fetchError;
        }

        const { data, error } = await supabase
          .from("profiles")
          .upsert(
            { ...existing, ...input, user_id: userId },
            { onConflict: "user_id" }
          )
          .select("gender, age, height, weight, measurement_system")
          .single();
        if (error) {
          throw error;
        }
        return { profile: data, success: true };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object"
              ? JSON.stringify(err)
              : String(err);
        return { error: `Failed to update profile: ${message}` };
      }
    },
    inputSchema: z.object({
      age: z.number().int().min(10).max(120).optional(),
      gender: z.enum(["male", "female"]).optional(),
      height: z.number().positive().optional(),
      measurement_system: z.enum(["metric", "us", "uk"]).optional(),
      weight: z.number().positive().optional(),
    }),
  });
}
