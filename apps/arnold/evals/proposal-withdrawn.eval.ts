import { defineEval } from "eve/evals";

import { NUMBERS_GATE, proposalBuild, proposalStubs } from "./fixtures";

export default defineEval({
  description:
    "A side question while a proposal waits withdraws it: Arnold answers the question, offers to bring the proposal back, and proposes it again once the user says yes.",
  async test(t) {
    const session = await t.session({ stubs: proposalStubs });

    await session.send("Add one more set to the bench press in my plan.", {
      clientContext: proposalBuild,
    });
    session.requireInteraction({ toolName: "propose_plan" });

    const side = await session.send(
      "Quick question first: how long should I rest between heavy bench sets?",
      { clientContext: proposalBuild }
    );

    // The waiting call settles in this turn, withdrawn by the message; no
    // fresh one waits until the user says yes
    side.calledTool("propose_plan", { count: 1, status: "rejected" });
    side.calledTool("propose_plan", { count: 0, status: "pending" });
    t.judge(
      "The response answers how long to rest between heavy bench press sets, then offers to bring back the proposed plan change (the extra bench press set) or asks whether to propose it again. It does not say the change was saved.",
      { on: side.reply }
    )
      .label("answers and offers it back")
      .gate(NUMBERS_GATE);

    const back = await session.send("Yes, bring it back.", {
      clientContext: proposalBuild,
    });

    back.calledTool("propose_plan", { count: 1, status: "pending" });
    t.awaitingInput();
  },
});
