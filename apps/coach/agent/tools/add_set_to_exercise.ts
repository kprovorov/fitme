import { asUser } from "@fitme/db";
import { addSetToExercise } from "@fitme/services/workout-edits";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireConversationOwner } from "../lib/owner";
import { requestKey } from "../lib/request-key";

export default defineTool({
  description:
    "Add a new set to an existing workout exercise. The set is appended after all current sets. Find workout_exercise_id via get_active_plan.",
  async execute(input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const { workout_exercise_id, ...set } = input;
    const added = await asUser(userId, (tx) =>
      addSetToExercise(tx, userId, {
        requestKey: requestKey(ctx, input),
        set,
        workoutExerciseId: workout_exercise_id,
      })
    );
    return added
      ? { order: added.order, set_id: added.id, success: true }
      : { error: "Workout exercise not found" };
  },
  inputSchema: z.object({
    reps_recommended: z
      .number()
      .int()
      .min(1)
      .describe("Recommended reps for the new set"),
    rest_recommended: z
      .number()
      .int()
      .min(0)
      .describe("Recommended rest time in seconds after this set"),
    weight_recommended: z
      .number()
      .min(0)
      .describe("Recommended weight for the new set in the user's unit system"),
    workout_exercise_id: z
      .string()
      .uuid()
      .describe("The ID of the workout_exercise row to add a set to"),
  }),
});
