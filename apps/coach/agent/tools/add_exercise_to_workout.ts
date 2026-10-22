import { asUser } from "@fitme/db";
import {
  addExerciseToWorkout,
  MAX_SETS_PER_EXERCISE,
} from "@fitme/services/workout-edits";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkExerciseSlugs, exerciseSlugSchema } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";
import { requestKey } from "../lib/request-key";
import { reportingEditErrors, setSchema } from "../lib/workout-edits";

export default defineTool({
  description:
    "Add an exercise to a specific workout in the user's plan. Use search_exercises first to find a valid exercise_slug. Provide initial sets with rep, weight, and rest recommendations.",
  async execute(input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const { exercise_slug, sets, workout_id } = input;
    const checked = await checkExerciseSlugs([exercise_slug]);
    if ("error" in checked) {
      return checked;
    }
    return await reportingEditErrors(async () => {
      const added = await asUser(userId, (tx) =>
        addExerciseToWorkout(tx, userId, {
          exerciseSlug: exercise_slug,
          requestKey: requestKey(ctx, input),
          sets,
          workoutId: workout_id,
        })
      );
      return added
        ? {
            sets_added: added.setsAdded,
            success: true,
            workout_exercise_id: added.id,
          }
        : { error: "Workout not found" };
    });
  },
  inputSchema: z.object({
    exercise_slug: exerciseSlugSchema.describe(
      "The exercise_slug of the exercise to add (from search_exercises)"
    ),
    sets: z
      .array(setSchema)
      .min(1)
      .max(MAX_SETS_PER_EXERCISE)
      .describe("Initial sets configuration for this exercise"),
    workout_id: z
      .guid()
      .describe("The ID of the workout to add the exercise to"),
  }),
});
