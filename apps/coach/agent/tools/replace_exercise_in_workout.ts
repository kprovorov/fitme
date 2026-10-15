import { asUser } from "@fitme/db";
import { replaceExerciseInWorkout } from "@fitme/services/workout-edits";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";
import {
  MAX_SETS_PER_EXERCISE,
  reportingUnknownExercises,
  setSchema,
} from "../lib/workout-edits";

export default defineTool({
  description:
    "Swap one exercise for another in a workout and replace its sets with new rep/weight/rest recommendations suited to the new exercise. Use search_exercises to find the new_exercise_id.",
  async execute({ new_exercise_id, sets, workout_exercise_id }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    return await reportingUnknownExercises(async () => {
      const replaced = await asUser(userId, (tx) =>
        replaceExerciseInWorkout(tx, userId, {
          newExerciseId: new_exercise_id,
          sets,
          workoutExerciseId: workout_exercise_id,
        })
      );
      return replaced
        ? {
            new_exercise_id,
            sets_replaced: sets.length,
            success: true,
            workout_exercise_id,
          }
        : { error: "Workout exercise not found" };
    });
  },
  inputSchema: z.object({
    new_exercise_id: z
      .string()
      .uuid()
      .describe(
        "The ID of the replacement exercise from the exercise library (from search_exercises)"
      ),
    sets: z
      .array(setSchema)
      .min(1)
      .max(MAX_SETS_PER_EXERCISE)
      .describe(
        "New sets configuration suited to the replacement exercise. Replaces all existing sets."
      ),
    workout_exercise_id: z
      .string()
      .uuid()
      .describe(
        "The ID of the workout_exercise row to replace (the 'id' field on each exercise entry from get_active_plan)"
      ),
  }),
});
