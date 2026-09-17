import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createGetUserProfileTool({ supabase }: SupabaseContext) {
  return tool({
    description:
      "Get the user's profile including age, gender, height, weight, and preferred measurement system",
    execute: async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        return { error: "Could not identify user" };
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("gender, age, height, weight, measurement_system")
        .eq("user_id", user.id)
        .single();
      if (error) {
        return { error: "Profile not found" };
      }
      return data;
    },
    inputSchema: z.object({}),
  });
}
