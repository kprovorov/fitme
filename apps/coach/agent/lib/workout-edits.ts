import { MAX_REPS, MAX_WEIGHT } from "@fitme/core/limits";
import { TooManySetsError } from "@fitme/services/workout-edits";
import { z } from "zod";

/** The rest bound MCP's plan tools use (apps/mcp/src/tools/plan-schemas.ts). */
export const MAX_REST_SECONDS = 3600;

/** A set's targets, as the Plan-editing tools take them. */
export const setSchema = z.object({
  reps_recommended: z
    .number()
    .int()
    .min(1)
    .max(MAX_REPS)
    .describe("Number of reps recommended for this set"),
  rest_recommended: z
    .number()
    .int()
    .min(0)
    .max(MAX_REST_SECONDS)
    .describe("Rest time in seconds after this set"),
  weight_recommended: z
    .number()
    .min(0)
    .max(MAX_WEIGHT)
    .describe("Recommended weight in the user's unit system"),
});

/**
 * Runs a Plan edit; an Exercise already at its set limit becomes an error the
 * model can act on, anything else still throws. Exercise slugs are checked
 * before the edit (`checkExerciseSlugs`).
 */
export const reportingEditErrors = async <T>(
  edit: () => Promise<T>
): Promise<T | { error: string }> => {
  try {
    return await edit();
  } catch (error) {
    if (error instanceof TooManySetsError) {
      return { error: error.message };
    }
    throw error;
  }
};
