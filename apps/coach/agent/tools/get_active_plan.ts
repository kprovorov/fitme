import { asUser } from "@fitme/db";
import { getActivePlan } from "@fitme/services/plans";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { describeExercises } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

export default defineTool({
  description:
    "Get the user's currently active workout plan with all workouts and exercises",
  async execute(_input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const plan = await asUser(userId, (tx) => getActivePlan(tx, userId));
    if (!plan) {
      return { error: "No active plan found" };
    }
    const describe = await describeExercises(
      plan.workouts.flatMap(({ exercises }) =>
        exercises.map(({ exercise_slug }) => exercise_slug)
      )
    );
    return {
      ...plan,
      workouts: plan.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map(
          ({ exercise_slug, id, order, sets }) => ({
            exercise_slug,
            id,
            ...describe(exercise_slug),
            order,
            sets,
          })
        ),
      })),
    };
  },
  inputSchema: z.object({}),
});
