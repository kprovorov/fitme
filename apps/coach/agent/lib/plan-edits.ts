import { UnknownExercisesError } from "@fitme/services/plans";
import { z } from "zod";

/** A set's targets, as the Plan-editing tools take them. */
export const setSchema = z.object({
  reps_recommended: z
    .number()
    .int()
    .min(1)
    .describe("Number of reps recommended for this set"),
  rest_recommended: z
    .number()
    .int()
    .min(0)
    .describe("Rest time in seconds after this set"),
  weight_recommended: z
    .number()
    .min(0)
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
