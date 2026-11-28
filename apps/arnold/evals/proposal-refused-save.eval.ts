import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

import {
  NEW_PLAN_VERSION,
  NUMBERS_GATE,
  proposalBuild,
  readsBeforeProposing,
  staleSaveStubs,
  turnText,
} from "./fixtures";

export default defineEval({
  description:
    "Accepting a proposal whose Plan changed meanwhile: the save is refused, so Arnold says why, reads the Plan again and proposes afresh.",
  async test(t) {
    const session = await t.session({ stubs: staleSaveStubs });

    await session.send("Add one more set to the bench press in my plan.", {
      clientContext: proposalBuild,
    });

    const request = session.requireInteraction({ toolName: "propose_plan" });

    const accepted = await session.respond(
      [{ interactionId: request.interactionId, optionId: "approve" }],
      { clientContext: proposalBuild }
    );

    accepted.calledTool("propose_plan", { count: 1, status: "failed" });
    t.check(
      accepted.toolCalls.map(({ name }) => name),
      satisfies(
        (names: readonly string[]) =>
          readsBeforeProposing(names.slice(names.indexOf("propose_plan") + 1)),
        "reads the plan again after the refusal, before the fresh proposal"
      )
    ).label("reads again");
    accepted.calledTool("propose_plan", {
      count: 1,
      input: { plan_version: NEW_PLAN_VERSION },
      status: "pending",
    });

    t.judge(
      "The response tells the user their plan had changed since it was read, so the change wasn't saved, and that there is a fresh proposal for them to look at. It does not claim anything was saved.",
      { on: turnText(accepted) }
    )
      .label("says why")
      .gate(NUMBERS_GATE);

    t.awaitingInput();
  },
});
