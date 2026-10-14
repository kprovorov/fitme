/**
 * Spend caps for one Coach turn: at most 20 model calls, and a token budget.
 * eve's own usage limits are per session and ask the user to continue, which
 * the app can't answer, so the Coach enforces these per turn from hooks and
 * cancels the turn before the call that would go over.
 *
 * Tokens, not dollars: the direct OpenAI and Anthropic providers report no
 * cost. Usage is only known after a call, so the budget stops the turn from
 * starting another call once it is spent: the last call can overshoot it by
 * its own size.
 *
 * The 20 counts model steps (`stepIndex`), not provider attempts. EVE retries
 * a crashed or failed step up to 4 times under the same index, and restores
 * session state from the step's input on each retry, so attempts can't be
 * counted durably from here; retries are bounded by EVE, not by this cap.
 */
export const MAX_STEPS_PER_TURN = 20;
export const MAX_TURN_INPUT_TOKENS = 1_500_000;
export const MAX_TURN_OUTPUT_TOKENS = 100_000;

/** Tokens the model calls of one turn reported so far. */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  turnId: string;
}

interface StepUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

/** `usage` plus one finished step of `turnId`; a new turn starts from zero. */
export const addStepUsage = (
  usage: TurnUsage | null,
  turnId: string,
  step: StepUsage | undefined
): TurnUsage => {
  const soFar =
    usage?.turnId === turnId
      ? usage
      : { inputTokens: 0, outputTokens: 0, turnId };
  return {
    inputTokens: soFar.inputTokens + (step?.inputTokens ?? 0),
    outputTokens: soFar.outputTokens + (step?.outputTokens ?? 0),
    turnId,
  };
};

/**
 * Which cap stops the model call about to start (`stepIndex` is 0-based
 * within the turn), or `null` when it may run.
 */
export const turnLimitReached = (
  step: { readonly stepIndex: number; readonly turnId: string },
  usage: TurnUsage | null
): "budget" | "steps" | null => {
  if (step.stepIndex >= MAX_STEPS_PER_TURN) {
    return "steps";
  }
  if (
    usage?.turnId === step.turnId &&
    (usage.inputTokens >= MAX_TURN_INPUT_TOKENS ||
      usage.outputTokens >= MAX_TURN_OUTPUT_TOKENS)
  ) {
    return "budget";
  }
  return null;
};
