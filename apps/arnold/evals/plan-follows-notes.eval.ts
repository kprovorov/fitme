import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { z } from "zod";

import {
  BENCH,
  exerciseNote,
  INCLINE,
  LEG_PRESS,
  noteStubs,
  ROW,
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

const slugsOf = (workouts: ProposedPlan["workouts"]) =>
  workouts.flatMap(({ exercises }) =>
    exercises.map(({ exercise_slug }) => exercise_slug)
  );

/**
 * He reads the Exercise notes before proposing a Plan and lets them shape it:
 * a knee that hurts below parallel on the squat keeps the Back Squat out,
 * the legs still trained (the Leg Press), and the card carries no note.
 */
export default defineEval({
  description:
    "Reads the exercise notes before proposing a plan, and the plan follows them: no back squat for a knee that hurts below parallel.",
  async test(t) {
    const session = await t.session({
      stubs: noteStubs([
        exerciseNote(
          SQUAT,
          "Back Squat",
          "Knee hurts below parallel, so no deep squats for now."
        ),
        exerciseNote(BENCH, "Bench Press", "Arch, feet flat."),
      ]),
    });

    const turn = await session.send(
      "Build me a 2-day full-body plan for muscle gain at the gym. I'm intermediate and have 60 minutes per workout."
    );

    t.succeeded();
    turn.calledTool("list_exercise_notes");
    turn.calledTool("display_workout_plan", { count: 1 });
    turn.toolOrder(["list_exercise_notes", "display_workout_plan"]);

    const display = turn.toolCalls.find(
      (call) => call.name === "display_workout_plan"
    );

    const proposed = proposedPlanSchema.optional().parse(display?.input);
    const workouts = proposed?.workouts ?? [];

    t.check(
      workouts,
      satisfies(
        (shown: ProposedPlan["workouts"]) =>
          shown.length > 0 &&
          slugsOf(shown).every((slug) => LIBRARY_SLUGS.has(slug)),
        "every exercise uses a slug search_exercises returned"
      )
    );
    t.check(
      workouts,
      satisfies(
        (shown: ProposedPlan["workouts"]) => !slugsOf(shown).includes(SQUAT),
        "the back squat the note rules out isn't in the plan"
      )
    );
    t.check(
      workouts,
      satisfies(
        (shown: ProposedPlan["workouts"]) => slugsOf(shown).includes(LEG_PRESS),
        "the legs are still trained, with the leg press"
      )
    );
    t.check(
      JSON.stringify(display?.input ?? {}),
      satisfies(
        (card: string) => !card.includes("Knee hurts"),
        "the plan card carries no exercise note"
      )
    );
  },
});
