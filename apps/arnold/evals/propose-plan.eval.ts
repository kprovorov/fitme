import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { BENCH, INCLINE, ROW, readToolStubs, SQUAT } from "./fixtures";

const LIBRARY_SLUGS = new Set([BENCH, INCLINE, ROW, SQUAT]);

interface ProposedPlan {
  workouts: { exercises: { exercise_slug: string }[] }[];
}

export default defineEval({
  description:
    "Propose a plan: searches exercises, then renders the Plan through display_workout_plan with library slugs only.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });
    const turn = await session.send(
      "Build me a 2-day full-body plan for muscle gain at the gym. I'm a beginner and have 45 minutes per workout."
    );

    t.succeeded();
    turn.calledTool("search_exercises");
    turn.calledTool("display_workout_plan", { count: 1 });
    turn.toolOrder(["search_exercises", "display_workout_plan"]);

    const display = turn.toolCalls.find(
      (call) => call.name === "display_workout_plan"
    );
    const proposed = display?.input as unknown as ProposedPlan | undefined;
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
