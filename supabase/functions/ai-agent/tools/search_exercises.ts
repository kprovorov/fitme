import { tool } from "npm:ai";
import { z } from "npm:zod";
import { ToolContext } from "./types.ts";

export function createSearchExercisesTool({
  supabaseClient,
  log,
}: ToolContext) {
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
          "Filter by muscle group: chest, back, shoulders, biceps, triceps, forearms, abs, obliques, quadriceps, hamstrings, glutes, calves, traps, lats, lower-back, cardio, full-body",
        ),
    }),
    execute: async ({ query, muscle_group }) => {
      log("tool_call", { tool: "search_exercises", query, muscle_group });
      let q = supabaseClient
        .from("exercises")
        .select("id, name, muscle_groups, description")
        .limit(15);
      if (query) q = q.ilike("name", `%${query}%`);
      if (muscle_group) q = q.contains("muscle_groups", [muscle_group]);
      const { data, error } = await q;
      if (error) {
        log("tool_error", { tool: "search_exercises", error: error.message });
        return { error: "Failed to search exercises" };
      }
      log("tool_ok", { tool: "search_exercises", count: data?.length ?? 0 });
      return data ?? [];
    },
  });
}
