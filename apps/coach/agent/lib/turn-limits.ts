/**
 * Spend caps for one Coach turn: at most 20 model calls, and $1.00 of model
 * cost. eve's own usage limits are per session and ask the user to continue,
 * which the app can't answer, so the Coach enforces these per turn from hooks
 * and cancels the turn before the call that would go over.
 *
 * Every call goes through AI Gateway, which reports each step's cost in USD.
 * Cost is only known after a call, so the budget stops the turn from starting
 * another call once it is spent: the last call can overshoot it by its own
 * cost. A step that reports no cost fails closed: the turn stops before its
 * next call, so spend never runs uncapped.
 *
 * The 20 counts model steps (`stepIndex`), not provider attempts. EVE retries
 * a crashed or failed step up to 4 times under the same index, and restores
 * session state from the step's input on each retry, so attempts can't be
 * counted durably from here; retries are bounded by EVE, not by this cap.
 */
export const MAX_STEPS_PER_TURN = 20;
export const MAX_TURN_COST_USD = 1;

/** What the model calls of one turn cost so far. */
export interface TurnSpend {
  costUsd: number;
  turnId: string;
  /** A finished step of the turn reported no cost. */
  unpriced: boolean;
}

/** A `step.completed` event's `usage`; only the cost counts here. */
interface StepUsage {
  readonly costUsd?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/** The USD cost a finished step reported, or `null` when it reported none. */
export const reportedCostUsd = (
  usage: StepUsage | undefined
): number | null => {
  const cost = usage?.costUsd;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0
    ? cost
    : null;
};

/** `spend` plus one finished step of `turnId`; a new turn starts from zero. */
export const addStepCost = (
  spend: TurnSpend | null,
  turnId: string,
  usage: StepUsage | undefined
): TurnSpend => {
  const soFar =
    spend?.turnId === turnId ? spend : { costUsd: 0, turnId, unpriced: false };
  const cost = reportedCostUsd(usage);
  return {
    costUsd: soFar.costUsd + (cost ?? 0),
    turnId,
    unpriced: soFar.unpriced || cost === null,
  };
};

/**
 * Which cap stops the model call about to start (`stepIndex` is 0-based
 * within the turn), or `null` when it may run. `unpriced`: an earlier step of
 * the turn reported no cost.
 */
export const turnLimitReached = (
  step: { readonly stepIndex: number; readonly turnId: string },
  spend: TurnSpend | null
): "budget" | "steps" | "unpriced" | null => {
  if (step.stepIndex >= MAX_STEPS_PER_TURN) {
    return "steps";
  }
  if (spend?.turnId !== step.turnId) {
    return null;
  }
  if (spend.unpriced) {
    return "unpriced";
  }
  if (spend.costUsd >= MAX_TURN_COST_USD) {
    return "budget";
  }
  return null;
};
