import { describe, expect, it } from "vitest";
import {
  addStepUsage,
  MAX_STEPS_PER_TURN,
  MAX_TURN_INPUT_TOKENS,
  MAX_TURN_OUTPUT_TOKENS,
  turnLimitReached,
} from "../agent/lib/turn-limits";

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

  it("stops the next call once the turn spent its input or output budget", () => {
    const spentInput = addStepUsage(null, "t1", {
      inputTokens: MAX_TURN_INPUT_TOKENS,
    });
    const spentOutput = addStepUsage(null, "t1", {
      outputTokens: MAX_TURN_OUTPUT_TOKENS,
    });

    expect(turnLimitReached({ stepIndex: 3, turnId: "t1" }, spentInput)).toBe(
      "budget"
    );
    expect(turnLimitReached({ stepIndex: 3, turnId: "t1" }, spentOutput)).toBe(
      "budget"
    );
  });

  it("adds up a turn's steps and starts over on the next turn", () => {
    const half = Math.ceil(MAX_TURN_INPUT_TOKENS / 2);
    const once = addStepUsage(null, "t1", { inputTokens: half });
    const twice = addStepUsage(once, "t1", { inputTokens: half });

    expect(turnLimitReached({ stepIndex: 1, turnId: "t1" }, once)).toBe(null);
    expect(turnLimitReached({ stepIndex: 2, turnId: "t1" }, twice)).toBe(
      "budget"
    );

    expect(turnLimitReached({ stepIndex: 0, turnId: "t2" }, twice)).toBe(null);
    expect(addStepUsage(twice, "t2", { inputTokens: 10 })).toEqual({
      inputTokens: 10,
      outputTokens: 0,
      turnId: "t2",
    });
  });

  it("counts a step without reported usage as free", () => {
    expect(addStepUsage(null, "t1", undefined)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      turnId: "t1",
    });
  });
});
