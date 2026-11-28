import { defineEval } from "eve/evals";

import {
  NUMBERS_GATE,
  cardBuild,
  cardStubs,
  numbersFrom,
  weeklyGoal,
} from "./fixtures";

export default defineEval({
  description:
    "How did my week go, as a build that draws cards: shows the Weekly goal card, and any number in the answer is the read's.",
  async test(t) {
    const session = await t.session({ stubs: cardStubs });

    const turn = await session.send(
      "How did my week go? Today is 2026-10-14.",
      { clientContext: cardBuild }
    );

    t.succeeded();
    turn.calledTool("show_weekly_goal");
    t.judge(numbersFrom(weeklyGoal, { required: false }), { on: turn.reply })
      .label("numbers from the read")
      .gate(NUMBERS_GATE);
  },
});
