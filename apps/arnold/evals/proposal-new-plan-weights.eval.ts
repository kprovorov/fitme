import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { z } from "zod";

import { BENCH, proposalBuild, proposalStubs } from "./fixtures";

/** The Bench Press weights the user lifted, as its history answers them. */
const LIFTED_BENCH = new Set([70, 72.5]);

const newPlanSchema = z.object({
  workouts: z.array(
    z.object({
      exercises: z.array(
        z.object({
          exercise_slug: z.string(),
          sets: z.array(
            z.object({
              reps_recommended: z.number(),
              weight_recommended: z.number().nullable(),
            })
          ),
        })
      ),
    })
  ),
});

type NewPlan = z.infer<typeof newPlanSchema>;

const exercisesOf = ({ workouts }: NewPlan) =>
  workouts.flatMap(({ exercises }) => exercises);

const parsed = (input: unknown): NewPlan | null => {
  const result = newPlanSchema.safeParse(input);

  return result.success ? result.data : null;
};

export default defineEval({
  description:
    "A new Plan, as a build that draws the Plan Proposal: reads each Exercise's history, takes the Bench Press weight from what the user lifted and leaves the weight empty where there is no history.",
  async test(t) {
    const session = await t.session({ stubs: proposalStubs });

    const turn = await session.send(
      "Build me a 2-day full-body plan for muscle gain at the gym, with the bench press in it. I'm a beginner and have 45 minutes per workout.",
      { clientContext: proposalBuild }
    );

    turn.calledTool("search_exercises");
    turn.calledTool("get_exercise_history", {
      input: { exercise_slug: BENCH },
    });
    turn.notCalledTool("display_workout_plan");
    turn.calledTool("propose_plan", { count: 1, status: "pending" });

    const plan = parsed(
      session.requireInteraction({ toolName: "propose_plan" }).call?.input
    );

    t.check(
      plan,
      satisfies(
        (proposed: NewPlan | null) =>
          proposed !== null &&
          exercisesOf(proposed).some(
            ({ exercise_slug }) => exercise_slug === BENCH
          ) &&
          exercisesOf(proposed)
            .filter(({ exercise_slug }) => exercise_slug === BENCH)
            .every(({ sets }) =>
              sets.every(
                ({ weight_recommended }) =>
                  weight_recommended !== null &&
                  LIFTED_BENCH.has(weight_recommended)
              )
            ),
        "the Bench Press weights come from its history"
      )
    ).label("weight from history");

    t.check(
      plan,
      satisfies(
        (proposed: NewPlan | null) =>
          proposed !== null &&
          exercisesOf(proposed).some(
            ({ exercise_slug }) => exercise_slug !== BENCH
          ) &&
          exercisesOf(proposed)
            .filter(({ exercise_slug }) => exercise_slug !== BENCH)
            .every(({ sets }) =>
              sets.every(
                ({ weight_recommended }) => weight_recommended === null
              )
            ),
        "every exercise with no history has an empty weight"
      )
    ).label("no invented weight");

    t.check(
      plan,
      satisfies(
        (proposed: NewPlan | null) =>
          proposed !== null &&
          exercisesOf(proposed).every(({ sets }) =>
            sets.every(({ reps_recommended }) =>
              Number.isInteger(reps_recommended)
            )
          ),
        "every set's reps are a whole number"
      )
    ).label("whole reps");

    t.awaitingInput();
  },
});
