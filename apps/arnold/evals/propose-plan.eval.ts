import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { z } from "zod";

import {
  BENCH,
  INCLINE,
  LEG_PRESS,
  ROW,
  readToolStubs,
  SQUAT,
} from "./fixtures";

const LIBRARY_SLUGS = new Set([BENCH, INCLINE, LEG_PRESS, ROW, SQUAT]);

const proposedPlanSchema = z.object({
  workouts: z.array(
    z.object({
      exercises: z.array(z.object({ exercise_slug: z.string() })),
    })
  ),
});

type ProposedPlan = z.infer<typeof proposedPlanSchema>;

export default defineEval({
  description:
    "Propose a plan: reads the exercise notes and searches exercises, then renders the Plan through display_workout_plan with library slugs only.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });

    const turn = await session.send(
      "Build me a 2-day full-body plan for muscle gain at the gym. I'm a beginner and have 45 minutes per workout."
    );

    t.succeeded();
    turn.calledTool("list_exercise_notes");
    turn.calledTool("search_exercises");
    turn.calledTool("display_workout_plan", { count: 1 });
    turn.toolOrder(["list_exercise_notes", "display_workout_plan"]);
    turn.toolOrder(["search_exercises", "display_workout_plan"]);

    const display = turn.toolCalls.find(
      (call) => call.name === "display_workout_plan"
    );

    const proposed = proposedPlanSchema.optional().parse(display?.input);
    t.check(
      proposed?.workouts ?? [],
      satisfies(
        (workouts: ProposedPlan["workouts"]) =>
          workouts.length > 0 &&
          workouts.every(
            ({ exercises }) =>
              exercises.length > 0 &&
              exercises.every(({ exercise_slug }) =>
                LIBRARY_SLUGS.has(exercise_slug)
              )
          ),
        "every exercise uses a slug search_exercises returned"
      )
    );
  },
});
