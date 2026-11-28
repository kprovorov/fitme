import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import {
  LAST_SESSION_ID,
  cardBuild,
  cardStubs,
  isShortAnswer,
} from "./fixtures";

/** A card comes with a short answer, not every set again in text. */
const SHORT_ANSWER = 700;

export default defineEval({
  description:
    "How was my last workout, as a build that draws cards: reads the history and shows the latest Workout Session as a card.",
  async test(t) {
    const session = await t.session({ stubs: cardStubs });

    const turn = await session.send("How was my last workout?", {
      clientContext: cardBuild,
    });

    t.succeeded();
    turn.calledTool("get_workouts_history");
    turn.calledTool("show_workout_session", {
      input: { workout_session_id: LAST_SESSION_ID },
    });
    t.check(
      turn.reply,
      satisfies(
        isShortAnswer(SHORT_ANSWER),
        `a short answer beside the card (at most ${SHORT_ANSWER} characters)`
      )
    ).label("short answer");
  },
});
