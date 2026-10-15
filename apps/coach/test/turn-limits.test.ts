import { describe, expect, it } from "vitest";
import {
  addStepCost,
  MAX_STEPS_PER_TURN,
  MAX_TURN_COST_USD,
  missingCostError,
  reportedCostUsd,
  turnLimitReached,
} from "../agent/lib/turn-limits";

/** A step's usage with token counts but no cost. */
const tokensOnly = { inputTokens: 10, outputTokens: 5 };

describe("turnLimitReached", () => {
  it("lets the first 20 model calls of a turn run", () => {
    expect(MAX_STEPS_PER_TURN).toBe(20);
    for (let stepIndex = 0; stepIndex < MAX_STEPS_PER_TURN; stepIndex += 1) {
      expect(turnLimitReached({ stepIndex, turnId: "t1" }, null)).toBe(null);
    }
  });

  it("stops the 21st model call", () => {
    expect(
      turnLimitReached({ stepIndex: MAX_STEPS_PER_TURN, turnId: "t1" }, null)
    ).toBe("steps");
  });

  it("adds up a turn's cost and starts over on the next turn", () => {
    const once = addStepCost(null, "t1", { costUsd: 0.25 });
    const twice = addStepCost(once, "t1", { costUsd: 0.5 });

    expect(twice).toEqual({ costUsd: 0.75, turnId: "t1", unpriced: false });
    expect(addStepCost(twice, "t2", { costUsd: 0.1 })).toEqual({
      costUsd: 0.1,
      turnId: "t2",
      unpriced: false,
    });
  });

  it("stops the next call once the turn spent $1.00", () => {
    expect(MAX_TURN_COST_USD).toBe(1);
    const under = addStepCost(null, "t1", { costUsd: 0.99 });
    const spent = addStepCost(under, "t1", { costUsd: 0.01 });
    const over = addStepCost(under, "t1", { costUsd: 0.6 });

    expect(turnLimitReached({ stepIndex: 1, turnId: "t1" }, under)).toBe(null);
    expect(turnLimitReached({ stepIndex: 2, turnId: "t1" }, spent)).toBe(
      "budget"
    );
    expect(turnLimitReached({ stepIndex: 2, turnId: "t1" }, over)).toBe(
      "budget"
    );
  });

  it("lets a new turn run after the previous one spent its budget", () => {
    const spent = addStepCost(null, "t1", { costUsd: 1.5 });

    expect(turnLimitReached({ stepIndex: 0, turnId: "t2" }, spent)).toBe(null);
  });

  it("stops the call after a step that reported no cost", () => {
    const priced = addStepCost(null, "t1", { costUsd: 0.01 });
    const noUsage = addStepCost(priced, "t1", undefined);
    const noCost = addStepCost(priced, "t1", tokensOnly);
    const thenPriced = addStepCost(noCost, "t1", { costUsd: 0.01 });

    expect(turnLimitReached({ stepIndex: 2, turnId: "t1" }, noUsage)).toBe(
      "unpriced"
    );
    expect(turnLimitReached({ stepIndex: 2, turnId: "t1" }, noCost)).toBe(
      "unpriced"
    );
    expect(turnLimitReached({ stepIndex: 3, turnId: "t1" }, thenPriced)).toBe(
      "unpriced"
    );
    expect(turnLimitReached({ stepIndex: 0, turnId: "t2" }, noCost)).toBe(null);
  });
});

describe("reportedCostUsd", () => {
  it("is the step's reported cost, free steps included", () => {
    expect(reportedCostUsd({ costUsd: 0.0123 })).toBe(0.0123);
    expect(reportedCostUsd({ costUsd: 0 })).toBe(0);
  });

  it("is null, to be reported, when the step reported no usable cost", () => {
    expect(reportedCostUsd(undefined)).toBe(null);
    expect(reportedCostUsd(tokensOnly)).toBe(null);
    expect(reportedCostUsd({ costUsd: Number.NaN })).toBe(null);
    expect(reportedCostUsd({ costUsd: -1 })).toBe(null);
  });
});

describe("missingCostError", () => {
  it("reports a step that reported no cost", () => {
    const error = missingCostError({ stepIndex: 3, usage: tokensOnly });

    expect(error?.name).toBe("Coach step cost missing");
    expect(error?.message).toContain("step 3 reported no cost");
    expect(missingCostError({ stepIndex: 0 })).not.toBe(null);
  });

  it("reports nothing for a step that reported its cost", () => {
    expect(missingCostError({ stepIndex: 3, usage: { costUsd: 0 } })).toBe(
      null
    );
  });
});
