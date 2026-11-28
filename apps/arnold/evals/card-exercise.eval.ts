import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import { cardBuild, cardStubs, isShortAnswer } from "./fixtures";

/** A card comes with a short answer, not the card again in text. */
const SHORT_ANSWER = 600;

export default defineEval({
  description:
    "Find a chest exercise, as a build that draws cards: searches the library and shows the Exercise card with a short answer.",
  async test(t) {
    const session = await t.session({ stubs: cardStubs });

    const turn = await session.send("Find me a good chest exercise.", {
      clientContext: cardBuild,
    });

    t.succeeded();
    turn.calledTool("search_exercises");
    turn.calledTool("show_exercises");
    turn.notCalledTool("display_workout_plan");
    t.check(
      turn.reply,
      satisfies(
        isShortAnswer(SHORT_ANSWER),
        `a short answer beside the card (at most ${SHORT_ANSWER} characters)`
      )
    ).label("short answer");
  },
});
