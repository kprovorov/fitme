import type * as Observability from "@fitme/observability/node";
import type * as EveContext from "eve/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { reportedCostUsd } from "../agent/lib/turn-limits";
import { hookSession, resetState } from "./hooks";
import type { EveEvent } from "./hooks";

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<Pick<typeof EveContext, "defineState">>(
  import("eve/context"),
  async () => {
    const { testState } = await import("./hooks");

    return testState;
  }
);

const { default: turnLimits } = await import("../agent/hooks/turn-limits");

let sequence = 0;

const stepStarted = (turnId: string, stepIndex: number): EveEvent => {
  sequence += 1;

  return {
    data: { modelId: "openai/gpt-6.1-terra", sequence, stepIndex, turnId },
    type: "step.started",
  };
};

const stepCompleted = (
  turnId: string,
  stepIndex: number,
  usage?: { costUsd?: number; inputTokens?: number; outputTokens?: number }
): EveEvent => {
  sequence += 1;

  return {
    data: { finishReason: "tool-calls", sequence, stepIndex, turnId, usage },
    type: "step.completed",
  };
};

const stepFailed = (turnId: string, stepIndex: number): EveEvent => {
  sequence += 1;

  return {
    data: {
      code: "model_call_failed",
      message: "The model call failed",
      sequence,
      stepIndex,
      turnId,
    },
    type: "step.failed",
  };
};

/** A session running the turn-limit hook. */
const session = () => {
  const { emit } = hookSession(turnLimits);

  return {
    /** One model call of `turnId` that ran to completion with `usage`. */
    async call(
      turnId: string,
      stepIndex: number,
      usage: Parameters<typeof stepCompleted>[2]
    ) {
      const started = await emit(stepStarted(turnId, stepIndex));
      await emit(stepCompleted(turnId, stepIndex, usage));

      return started;
    },
    emit,
  };
};

describe("turn-limit hook", () => {
  beforeEach(() => {
    resetState();
    vi.spyOn(console, "warn").mockReturnValue(undefined);
  });

  it("lets 20 model calls of a turn run and cancels the 21st", async () => {
    const { call, emit } = session();

    for (let stepIndex = 0; stepIndex < 20; stepIndex += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
      await expect(
        call("turn_1", stepIndex, { costUsd: 0.01 })
      ).resolves.toStrictEqual({ cancelled: false });
    }

    await expect(emit(stepStarted("turn_1", 20))).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("cancels the call after the turn's model cost reached $1.00", async () => {
    const { call, emit } = session();

    await call("turn_1", 0, { costUsd: 0.6 });
    await expect(call("turn_1", 1, { costUsd: 0.4 })).resolves.toStrictEqual({
      cancelled: false,
    });
    await expect(emit(stepStarted("turn_1", 2))).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("lets the calls under $1.00 run", async () => {
    const { call, emit } = session();

    await call("turn_1", 0, { costUsd: 0.5 });
    await call("turn_1", 1, { costUsd: 0.49 });
    await expect(emit(stepStarted("turn_1", 2))).resolves.toStrictEqual({
      cancelled: false,
    });
  });

  it("gives the next turn its own budget", async () => {
    const { call, emit } = session();

    await call("turn_1", 0, { costUsd: 1.5 });
    await expect(emit(stepStarted("turn_1", 1))).resolves.toStrictEqual({
      cancelled: true,
    });
    await expect(emit(stepStarted("turn_2", 0))).resolves.toStrictEqual({
      cancelled: false,
    });
  });

  it("reports a finished call with no cost and cancels the next one", async () => {
    const { call, emit } = session();

    await call("turn_1", 0, { costUsd: 0.01 });
    expect(observability.reportError).not.toHaveBeenCalled();

    await call("turn_1", 1, { inputTokens: 10, outputTokens: 5 });
    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: expect.stringContaining("step 1 reported no cost"),
        name: "Arnold step cost missing",
      }),
      { sessionId: "wrun_1", stepIndex: "1", turnId: "turn_1" }
    );
    await expect(emit(stepStarted("turn_1", 2))).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("reports a finished call with no usage at all", async () => {
    const { call, emit } = session();

    await call("turn_1", 0, undefined);
    expect(observability.reportError).toHaveBeenCalledOnce();
    await expect(emit(stepStarted("turn_1", 1))).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("doesn't count a retried call of the same step twice", async () => {
    const { call, emit } = session();

    for (let stepIndex = 0; stepIndex < 19; stepIndex += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
      await call("turn_1", stepIndex, { costUsd: 0.01 });
    }

    await expect(emit(stepStarted("turn_1", 19))).resolves.toStrictEqual({
      cancelled: false,
    });
    await emit(stepFailed("turn_1", 19));
    await expect(call("turn_1", 19, { costUsd: 0.01 })).resolves.toStrictEqual({
      cancelled: false,
    });
    await expect(emit(stepStarted("turn_1", 20))).resolves.toStrictEqual({
      cancelled: true,
    });
  });
});

describe("reported step cost", () => {
  it("is the step's reported cost, free steps included", () => {
    expect(reportedCostUsd({ costUsd: 0.0123 })).toBe(0.0123);
    expect(reportedCostUsd({ costUsd: 0 })).toBe(0);
  });

  it("is null, to be reported, when the step reported no usable cost", () => {
    expect(reportedCostUsd(undefined)).toBeNull();
    expect(reportedCostUsd({ inputTokens: 10, outputTokens: 5 })).toBeNull();
    expect(reportedCostUsd({ costUsd: Number.NaN })).toBeNull();
    expect(reportedCostUsd({ costUsd: -1 })).toBeNull();
  });
});
