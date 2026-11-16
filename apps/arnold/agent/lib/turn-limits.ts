import { z } from "zod";

/**
 * Spend caps for one Arnold turn: at most 20 model calls, and $1.00 of model
 * cost. eve's own usage limits are per session and ask the user to continue,
 * which the app can't answer, so Arnold enforces these per turn from hooks
 * and cancels the turn before the call that would go over.
 *
 * A model call is one `model.requested`: eve records it before it picks the
 * model and makes the call, so a cancel there stops the call from happening.
 * A failed provider attempt that eve retries is `model.retried` within the
 * same call, so it never counts twice.
 *
 * Every call goes through AI Gateway, which reports each call's cost in USD
 * on `usage.recorded`. Cost is only known after a call, so the budget stops
 * the turn from starting another call once it is spent: the last call can
 * overshoot it by its own cost. A call that finished without a cost fails
 * closed: the turn stops before its next call, so spend never runs uncapped.
 */
export const MAX_MODEL_CALLS_PER_TURN = 20;
export const MAX_TURN_COST_USD = 1;

/** The cap that stops a turn's next model call. */
export type TurnLimit = "budget" | "model-calls" | "unpriced";

/** What the model calls of one turn cost so far. */
export interface TurnSpend {
  readonly costUsd: number;
  readonly modelCalls: number;
  /** The turn's model calls, by eve's run id. */
  readonly runIds: readonly string[];
  readonly turnId: string;
  /** A finished model call of the turn reported no cost. */
  readonly unpriced: boolean;
}

/** A `usage.recorded` event's `usage`; only the cost counts, tokens don't. */
interface CallUsage {
  readonly costUsd?: number;
}

const costUsdSchema = z.number().nonnegative();

/** The USD cost a model call reported, or `null` when it reported none. */
export const reportedCostUsd = (
  usage: CallUsage | undefined
): number | null => {
  const cost = costUsdSchema.safeParse(usage?.costUsd);

  return cost.success ? cost.data : null;
};

const limitReached = (spend: TurnSpend): TurnLimit | null => {
  if (spend.modelCalls >= MAX_MODEL_CALLS_PER_TURN) {
    return "model-calls";
  }

  if (spend.unpriced) {
    return "unpriced";
  }

  if (spend.costUsd >= MAX_TURN_COST_USD) {
    return "budget";
  }

  return null;
};

/** What a requested model call meets: the cap that stops it, and the spend. */
export interface ModelCallRequest {
  readonly reached: TurnLimit | null;
  readonly spend: TurnSpend;
}

/** A model call of the turn that finished without a cost. */
export interface UnpricedCall {
  readonly error: Error;
  readonly spend: TurnSpend;
}

/**
 * A model call `turnId` asked for (`runId`): the cap that stops it, or none,
 * and the spend with it counted when it may run. A new turn starts from zero.
 */
export const requestModelCall = (
  spend: TurnSpend | null,
  call: { readonly runId: string; readonly turnId: string }
): ModelCallRequest => {
  const soFar: TurnSpend =
    spend?.turnId === call.turnId
      ? spend
      : {
          costUsd: 0,
          modelCalls: 0,
          runIds: [],
          turnId: call.turnId,
          unpriced: false,
        };

  const reached = limitReached(soFar);

  if (reached) {
    return { reached, spend: soFar };
  }

  return {
    reached: null,
    spend: {
      ...soFar,
      modelCalls: soFar.modelCalls + 1,
      runIds: [...soFar.runIds, call.runId],
    },
  };
};

const isTurnCall = (spend: TurnSpend | null, runId: string): boolean =>
  spend?.runIds.includes(runId) ?? false;

/** `spend` plus the cost one of its model calls reported. */
export const addCallCost = (
  spend: TurnSpend | null,
  runId: string,
  usage: CallUsage
): TurnSpend | null => {
  if (spend === null || !isTurnCall(spend, runId)) {
    return spend;
  }

  return { ...spend, costUsd: spend.costUsd + (reportedCostUsd(usage) ?? 0) };
};

/**
 * The error to report for a model call of the turn that finished without a
 * cost, and the spend that stops the turn's next call; `null` when the call
 * reported one, or isn't the turn's.
 */
export const unpricedCall = (
  spend: TurnSpend | null,
  runId: string,
  usage: CallUsage | undefined
): UnpricedCall | null => {
  if (
    spend === null ||
    !isTurnCall(spend, runId) ||
    reportedCostUsd(usage) !== null
  ) {
    return null;
  }

  const error = new Error(
    `model call ${runId} reported no cost; the turn stops before its next model call`
  );

  error.name = "Arnold model call cost missing";

  return { error, spend: { ...spend, unpriced: true } };
};
