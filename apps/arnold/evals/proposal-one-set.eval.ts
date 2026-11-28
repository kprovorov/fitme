import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { z } from "zod";

import {
  BENCH,
  BENCH_ROW_ID,
  NUMBERS_GATE,
  PLAN_ID,
  PLAN_VERSION,
  proposalBuild,
  proposalStubs,
  readsBeforeProposing,
  turnText,
} from "./fixtures";

const proposalSchema = z.object({
  plan_id: z.string(),
  plan_version: z.string(),
  workouts: z.array(
    z.object({
      exercises: z.array(
        z.object({
          exercise_slug: z.string(),
          id: z.string().optional(),
          sets: z.array(z.unknown()),
        })
      ),
    })
  ),
});

type Proposal = z.infer<typeof proposalSchema>;

/** The Upper Day alone, its Bench Press kept under its id with one set more. */
const addsOneBenchSet = ({ plan_id, plan_version, workouts }: Proposal) =>
  plan_id === PLAN_ID &&
  plan_version === PLAN_VERSION &&
  workouts.length === 1 &&
  workouts[0].exercises.some(
    ({ exercise_slug, id, sets }) =>
      exercise_slug === BENCH && id === BENCH_ROW_ID && sets.length === 3
  );

export default defineEval({
  description:
    "A one-set ask, as a build that draws the Plan Proposal: reads the Plan and proposes only the changed Workout, saying nothing is saved yet.",
  async test(t) {
    const session = await t.session({ stubs: proposalStubs });

    const turn = await session.send(
      "Add one more set to the bench press in my plan.",
      { clientContext: proposalBuild }
    );

    t.check(
      turn.toolCalls.map(({ name }) => name),
      satisfies(readsBeforeProposing, "reads the plan before proposing")
    ).label("reads first");
    turn.calledTool("propose_plan", { count: 1, status: "pending" });

    const request = session.requireInteraction({ toolName: "propose_plan" });

    t.check(
      request.call?.input,
      satisfies((input: unknown) => {
        const parsed = proposalSchema.safeParse(input);

        return parsed.success && addsOneBenchSet(parsed.data);
      }, "proposes the Upper Day alone, its Bench Press under its id with three sets, at the read marker")
    ).label("only the changed Workout");

    t.judge(
      "The response does not say the plan was changed, updated or saved. Describing the change as a proposal, or saying nothing at all (an empty response), passes.",
      { on: turnText(turn) }
    )
      .label("nothing claimed saved")
      .gate(NUMBERS_GATE);

    t.awaitingInput();
  },
});
