import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import {
  NUMBERS_GATE,
  cardStubs,
  mentionsNoCard,
  numbersFrom,
  oldBuild,
  showTools,
  weeklyGoal,
} from "./fixtures";

const A_CHEST_EXERCISE = /Bench Press|Incline Dumbbell Press/u;
const SQUAT = /squat/iu;
const LOGGED_SQUAT_WEIGHT = /105/u;

export default defineEval({
  description:
    "An old build (no cards in its client context) gets the card asks answered in text: no show tool, no card mentioned.",
  async test(t) {
    const asks = [
      {
        ask: "Find me a good chest exercise.",
        read: "search_exercises",
      },
      { ask: "How was my last workout?", read: "get_workouts_history" },
      {
        ask: "How did my week go? Today is 2026-10-14.",
        read: "get_weekly_goal",
      },
    ] as const;

    const [exercise, lastWorkout, week] = await Promise.all(
      asks.map(async ({ ask }) => {
        const session = await t.session({ stubs: cardStubs });

        return await session.send(ask, { clientContext: oldBuild });
      })
    );

    for (const [index, turn] of [exercise, lastWorkout, week].entries()) {
      const { ask, read } = asks[index];

      turn.calledTool(read);

      for (const tool of showTools) {
        turn.notCalledTool(tool);
      }

      t.check(
        turn.reply,
        satisfies(mentionsNoCard, "never mentions a card")
      ).label(`${ask}: no card mentioned`);
    }

    exercise.messageIncludes(A_CHEST_EXERCISE);
    lastWorkout.messageIncludes(SQUAT);
    lastWorkout.messageIncludes(LOGGED_SQUAT_WEIGHT);
    t.judge(numbersFrom(weeklyGoal, { required: true }), { on: week.reply })
      .label("week: numbers from the read")
      .gate(NUMBERS_GATE);

    t.succeeded();
  },
});
