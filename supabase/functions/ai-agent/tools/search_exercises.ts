import type { SupabaseContext } from "npm:@supabase/server";
import { tool } from "npm:ai";
import { z } from "npm:zod";

export function createSearchExercisesTool({ supabase }: SupabaseContext) {
  return tool({
    description:
      "Search for exercises in the exercise library by name or muscle group",
    inputSchema: z.object({
      query: z
        .string()
        .optional()
        .describe("Part of the exercise name to search for"),
      muscle_group: z
        .string()
        .optional()
        .describe(
          "Filter by muscle group: chest, back, shoulders, biceps, triceps, forearms, abs, obliques, quadriceps, hamstrings, glutes, calves, traps, lats, lower-back, cardio, full-body"
        ),
    }),
    execute: async ({ query, muscle_group }) => {
      let q = supabase
        .from("exercises")
        .select("id, name, muscle_groups")
        .limit(8);
      if (query) {
        q = q.ilike("name", `%${query}%`);
      }
      if (muscle_group) {
        q = q.contains("muscle_groups", JSON.stringify([muscle_group]));
      }
      const { data, error } = await q;
      if (error) {
        return { error: "Failed to search exercises" };
      }
      return data ?? [];
    },
  });
}
