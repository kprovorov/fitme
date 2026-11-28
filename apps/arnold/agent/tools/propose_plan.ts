import { asUser } from "@fitme/db";
import { savePlanProposal } from "@fitme/services/plan-proposals";
import { defineTool } from "eve/tools";
import type { ApprovalContext } from "eve/tools/approval";

import { loadCoverPicker } from "../lib/covers";
import type { CoverPicker } from "../lib/covers";
import { ownerOfTurn, requireConversationOwner } from "../lib/owner";
import {
  checkPlanProposal,
  PLAN_CHANGED,
  planProposalInputSchema,
  shownChanges,
  toPlanProposal,
} from "../lib/plan-proposals";
import { offeredForCardPerModelCall } from "../lib/tool-offer";

/** The picker of a save that adds no Workout, so has no Cover to pick. */
const NO_COVERS = { pick: (() => []) satisfies CoverPicker };

/** What the model is told about a second proposal in one response. */
export const ONE_PROPOSAL_PER_STEP =
  "Only one plan proposal can wait for the user at a time, and this response already made one. Put every change in that one proposal; this one wasn't shown.";

/**
 * `propose_plan` for a change to one of the User's Plans (ADR 0027): eve
 * holds the call and the app draws the Plan Proposal card from it; it runs
 * only when the User accepts. Its approval policy checks the proposal first
 * (`checkPlanProposal`) and refuses one that fails with the reason, and any
 * proposal after the first of the same model response, so nothing waits and
 * no card shows. eve runs the policy again when the User accepts, so a Plan
 * that changed meanwhile is refused then too.
 *
 * A fresh copy per model call (`offeredForCardPerModelCall`): the first call
 * id the policy holds is the response's one proposal. eve resolves a dynamic
 * tool before every model call and checks that call's response with the copy
 * it resolved; the recheck on Accept runs before the next model call
 * resolves its own copy, so it never takes the next response's slot.
 */
export const createProposePlan = () => {
  let firstCallId: string | undefined;

  return defineTool({
    approval: {
      prompt: () => "Save these changes to the plan?",
      request: async ({
        callId,
        session,
        toolInput,
      }: ApprovalContext<unknown>) => {
        // Claimed before any await, so two calls of one response checked at
        // once can't both be first
        firstCallId ??= callId;

        if (firstCallId !== callId) {
          return { reason: ONE_PROPOSAL_PER_STEP, type: "denied" };
        }

        const userId = ownerOfTurn(session.auth);

        const refused =
          userId === null
            ? "Only the conversation's owner can change their plan."
            : await checkPlanProposal(userId, toolInput);

        if (refused === null) {
          return "user-approval";
        }

        // A refused proposal waits for nobody, so a corrected one in the same
        // response may still be the one
        if (firstCallId === callId) {
          firstCallId = undefined;
        }

        return { reason: refused, type: "denied" };
      },
    },
    description:
      "Propose a change to one of the user's plans. The user sees it as a card and it's saved only when they accept it; nothing changes before that. Read the plan first with get_plan or get_active_plan, pass its plan_version, and send only what changes: each changed workout in full with every exercise and set it keeps (each row with the id it was read under, new rows without), the ids of workouts to remove, and the changed plan details. Every set has whole-number reps, a weight in the user's unit (0 for bodyweight) and a rest in seconds. Make at most one proposal per response. A refused proposal says what to fix.",
    async execute(input, ctx) {
      const userId = requireConversationOwner(ctx.session.auth);

      const addsWorkouts = (input.workouts ?? []).some(
        (workout) => workout.id === undefined
      );

      // Only a new Workout needs a Cover, so only then the Library and index
      const picker = addsWorkouts ? await loadCoverPicker() : NO_COVERS;

      // A tool error, never an `{ error }` result: the app draws the card's
      // outcome from the call
      if ("error" in picker) {
        throw new Error(picker.error);
      }

      const saved = await asUser(
        userId,
        async (tx) =>
          await savePlanProposal(
            tx,
            userId,
            input.plan_id,
            toPlanProposal(input),
            { coverNewWorkouts: picker.pick }
          )
      );

      switch (saved.status) {
        case "saved": {
          return {
            changes: shownChanges(saved.changes),
            plan_id: saved.planId,
          };
        }

        case "plan_changed": {
          throw new Error(PLAN_CHANGED);
        }

        case "invalid_ids": {
          throw new Error(
            `Nothing was saved: these ids aren't rows of the plan under the parent they were sent under, or are sent twice: ${saved.ids.join(", ")}. Read the plan again with get_plan and propose afresh.`
          );
        }

        case "no_workouts": {
          throw new Error(
            "Nothing was saved: the change would leave the plan without a workout."
          );
        }

        case "not_found": {
          throw new Error(
            `Nothing was saved: no plan ${input.plan_id} for the user, it was deleted. Read get_plans for the current plan ids.`
          );
        }

        default: {
          throw new Error("Nothing was saved.");
        }
      }
    },
    inputSchema: planProposalInputSchema,
  });
};

export default offeredForCardPerModelCall("plan_proposal", createProposePlan);
