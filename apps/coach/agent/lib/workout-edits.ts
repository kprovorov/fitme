import { UnknownExercisesError } from "@fitme/services/plans";
import { z } from "zod";

/** The bounds MCP's plan tools use (apps/mcp/src/tools/plan-schemas.ts). */
export const MAX_REPS = 1000;
export const MAX_REST_SECONDS = 3600;
export const MAX_WEIGHT = 10_000;
export const MAX_SETS_PER_EXERCISE = 20;

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
 * Runs a Plan edit; an Exercise missing from the library becomes an error the
 * model can act on (search again), anything else still throws.
 */
export const reportingUnknownExercises = async <T>(
  edit: () => Promise<T>
): Promise<T | { error: string }> => {
  try {
    return await edit();
  } catch (error) {
    if (error instanceof UnknownExercisesError) {
      return { error: error.message };
    }
    throw error;
  }
};
