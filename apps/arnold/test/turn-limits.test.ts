import type * as Observability from "@fitme/observability/node";
import type * as EveContext from "eve/context";
import type { Usage } from "eve/events";
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

let runs = 0;

const TOKENS = {
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  inputTokens: 10,
  outputTokens: 5,
} as const;

/** A model call's usage: with its cost, or none reported. */
const usageOf = (costUsd?: number): Usage =>
  costUsd === undefined ? TOKENS : { ...TOKENS, costUsd };

const modelRequested = (turnId: string, runId: string): EveEvent => ({
  data: { owner: { turnId }, runId },
  scope: { runId, turnId },
  type: "model.requested",
});

const modelStarted = (
  turnId: string,
  runId: string,
  attempt = 0
): EveEvent => ({
  data: { attempt, modelId: "openai/gpt-6.1-terra", runId },
  scope: { runId, turnId },
  type: "model.started",
});

const modelRetried = (turnId: string, runId: string): EveEvent => ({
  data: {
    attempt: 0,
    error: { code: "model_call_failed", message: "Upstream timed out" },
    runId,
  },
  scope: { runId, turnId },
  type: "model.retried",
});

const modelSettled = (
  turnId: string,
  runId: string,
  outcome: "completed" | "failed" = "completed"
): EveEvent => ({
  data: { finishReason: "tool-calls", outcome, runId },
  scope: { runId, turnId },
  type: "model.settled",
});

const usageRecorded = (
  turnId: string,
  runId: string,
  usage: Usage
): EveEvent => ({
  data: { kind: "model", owner: { runId }, usage },
  scope: { runId, turnId },
  type: "usage.recorded",
});

/**
 * The commits a turn already under way records when the User acts while a
 * call waits for approval (docs/research/arnold-tool-approval.md, "Turns, and
 * what marks each act"): the approval settles (accepted, declined, or
 * withdrawn by a message), then the turn consumes the act's delivery, with no
 * parts for an answer and the text for a message. All three continue the
 * paused turn.
 */
const userAct = (
  turnId: string,
  act: "accept" | "decline" | "message",
  count: number
): readonly (readonly EveEvent[])[] => {
  const interactionId = `interaction_${count}`;
  const deliveryId = `delivery_${count}`;

  const consumed: EveEvent = {
    data: {
      deliveryId,
      parts:
        act === "message"
          ? [{ kind: "text", text: "Make it four days a week instead." }]
          : [],
      turnId,
    },
    scope: { turnId },
    type: "delivery.consumed",
  };

  const settled: EveEvent =
    act === "message"
      ? {
          data: {
            interactionId,
            outcome: "withdrawn",
            reason: "superseded-by-message",
          },
          scope: { turnId },
          type: "interaction.settled",
        }
      : {
          data: {
            interactionId,
            outcome: act === "accept" ? "accepted" : "declined",
            response: { optionId: act === "accept" ? "approve" : "deny" },
          },
          scope: { turnId },
          type: "interaction.settled",
        };

  return [[settled], [consumed]];
};

const ACTS = ["accept", "decline", "message"] as const;

/** A session running the turn-limit hook. */
const session = () => {
  const { emit } = hookSession(turnLimits);

  return {
    /**
     * One model call of `turnId` as eve records it: requested, started, then
     * settled with its usage in one commit (no usage at all: `null`). Answers
     * whether the hook cancelled it at the request.
     */
    async call(turnId: string, usage: Usage | null) {
      runs += 1;
      const runId = `run_${runs}`;
      const requested = await emit(modelRequested(turnId, runId));

      if (requested.cancelled) {
        return requested;
      }

      await emit(modelStarted(turnId, runId));
      await (usage === null
        ? emit(modelSettled(turnId, runId))
        : emit(
            modelSettled(turnId, runId),
            usageRecorded(turnId, runId, usage)
          ));

      return requested;
    },
    /** The User acts in the paused turn `turnId`. */
    async act(turnId: string, act: (typeof ACTS)[number]) {
      runs += 1;

      for (const commit of userAct(turnId, act, runs)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- eve records an act's commits in order.
        await emit(...commit);
      }
    },
    emit,
    /** The next model call of `turnId`, asked for and no further. */
    request(turnId: string) {
      runs += 1;

      return emit(modelRequested(turnId, `run_${runs}`));
    },
  };
};

describe("turn-limit hook", () => {
  beforeEach(() => {
    resetState();
    vi.spyOn(console, "warn").mockReturnValue(undefined);
  });

  it("lets 20 model calls of a turn run and cancels the 21st", async () => {
    const { call, request } = session();

    for (let count = 0; count < 20; count += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
      await expect(call("turn_1", usageOf(0.01))).resolves.toStrictEqual({
        cancelled: false,
      });
    }

    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("cancels the call after the turn's model cost reached $1.00", async () => {
    const { call, request } = session();

    await call("turn_1", usageOf(0.6));
    await expect(call("turn_1", usageOf(0.4))).resolves.toStrictEqual({
      cancelled: false,
    });
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("lets the calls under $1.00 run", async () => {
    const { call, request } = session();

    await call("turn_1", usageOf(0.5));
    await call("turn_1", usageOf(0.49));
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: false,
    });
  });

  it("gives the next turn its own budget and call count", async () => {
    const { call, request } = session();

    await call("turn_1", usageOf(1.5));
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
    await expect(request("turn_2")).resolves.toStrictEqual({
      cancelled: false,
    });
  });

  it("reports a finished call with no cost and cancels the next one", async () => {
    const { call, request } = session();

    await call("turn_1", usageOf(0.01));
    expect(observability.reportError).not.toHaveBeenCalled();

    await call("turn_1", usageOf());
    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: expect.stringContaining("reported no cost"),
        name: "Arnold model call cost missing",
      }),
      { runId: `run_${runs}`, sessionId: "wrun_1", turnId: "turn_1" }
    );
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("reports a finished call with no usage at all", async () => {
    const { call, request } = session();

    await call("turn_1", null);
    expect(observability.reportError).toHaveBeenCalledOnce();
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("counts a retried call once", async () => {
    const { call, emit } = session();

    for (let count = 0; count < 19; count += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
      await call("turn_1", usageOf(0.01));
    }

    await expect(
      emit(modelRequested("turn_1", "run_retried"))
    ).resolves.toStrictEqual({ cancelled: false });
    await emit(modelStarted("turn_1", "run_retried"));
    await emit(modelRetried("turn_1", "run_retried"));
    await emit(modelStarted("turn_1", "run_retried", 1));
    await emit(
      modelSettled("turn_1", "run_retried"),
      usageRecorded("turn_1", "run_retried", usageOf(0.01))
    );

    await expect(
      emit(modelRequested("turn_1", "run_21"))
    ).resolves.toStrictEqual({ cancelled: true });
  });

  it("counts a context change's call inside a turn, and its cost", async () => {
    const { call, emit, request } = session();

    await call("turn_1", usageOf(0.5));
    await expect(
      emit({
        data: { owner: { changeId: "change_1" }, runId: "run_summary" },
        scope: { changeId: "change_1", runId: "run_summary", turnId: "turn_1" },
        type: "model.requested",
      })
    ).resolves.toStrictEqual({ cancelled: false });
    await emit({
      data: {
        kind: "model",
        owner: { changeId: "change_1" },
        usage: usageOf(0.5),
      },
      scope: { changeId: "change_1", turnId: "turn_1" },
      type: "usage.recorded",
    });

    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("fails closed on usage recorded without a cost, even when another attempt had one", async () => {
    const { emit, request } = session();

    await emit(modelRequested("turn_1", "run_1"));
    await emit(
      modelRetried("turn_1", "run_1"),
      usageRecorded("turn_1", "run_1", usageOf(0.01))
    );
    await emit(
      modelSettled("turn_1", "run_1"),
      usageRecorded("turn_1", "run_1", usageOf())
    );

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "Arnold model call cost missing" }),
      { runId: "run_1", sessionId: "wrun_1", turnId: "turn_1" }
    );
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("doesn't count a context change's model call between turns", async () => {
    const { call, emit, request } = session();

    for (let count = 0; count < 19; count += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
      await call("turn_1", usageOf(0.01));
    }

    await emit({
      data: { owner: { changeId: "change_1" }, runId: "run_summary" },
      scope: { changeId: "change_1", runId: "run_summary" },
      type: "model.requested",
    });
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: false,
    });
  });

  describe.each(ACTS)("after the User's %s while a call waits", (act) => {
    it("allows 20 more model calls, and cancels the 21st after it", async () => {
      const { act: userActs, call, request } = session();

      for (let count = 0; count < 20; count += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
        await call("turn_1", usageOf(0.01));
      }

      await userActs("turn_1", act);

      for (let count = 0; count < 20; count += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
        await expect(call("turn_1", usageOf(0.01))).resolves.toStrictEqual({
          cancelled: false,
        });
      }

      await expect(request("turn_1")).resolves.toStrictEqual({
        cancelled: true,
      });
    });

    it("restarts the cost cap", async () => {
      const { act: userActs, call, request } = session();

      await call("turn_1", usageOf(0.99));
      await userActs("turn_1", act);
      await expect(call("turn_1", usageOf(0.6))).resolves.toStrictEqual({
        cancelled: false,
      });
      await expect(call("turn_1", usageOf(0.39))).resolves.toStrictEqual({
        cancelled: false,
      });
      await call("turn_1", usageOf(0.01));
      await expect(request("turn_1")).resolves.toStrictEqual({
        cancelled: true,
      });
    });

    it("still fails closed on a call that reported no cost", async () => {
      const { act: userActs, call, request } = session();

      await call("turn_1", usageOf());
      await userActs("turn_1", act);
      await expect(request("turn_1")).resolves.toStrictEqual({
        cancelled: true,
      });
      expect(observability.reportError).toHaveBeenCalledOnce();
    });

    it("counts a call retried after it once", async () => {
      const { act: userActs, call, emit } = session();

      await call("turn_1", usageOf(0.01));
      await userActs("turn_1", act);

      for (let count = 0; count < 19; count += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
        await call("turn_1", usageOf(0.01));
      }

      await emit(modelRequested("turn_1", "run_retried"));
      await emit(modelStarted("turn_1", "run_retried"));
      await emit(modelRetried("turn_1", "run_retried"));
      await emit(modelStarted("turn_1", "run_retried", 1));
      await emit(
        modelSettled("turn_1", "run_retried"),
        usageRecorded("turn_1", "run_retried", usageOf(0.01))
      );

      await expect(
        emit(modelRequested("turn_1", "run_after"))
      ).resolves.toStrictEqual({ cancelled: true });
    });

    it("leaves another turn's spend alone", async () => {
      const { act: userActs, call, request } = session();

      await call("turn_2", usageOf(1.5));
      await userActs("turn_1", act);
      await expect(request("turn_2")).resolves.toStrictEqual({
        cancelled: true,
      });
    });
  });

  it("doesn't restart the caps on the delivery that starts a turn", async () => {
    const { call, emit, request } = session();

    await emit(
      {
        data: {
          cause: { deliveryId: "delivery_1" },
          follows: null,
          turnId: "turn_1",
        },
        scope: { turnId: "turn_1" },
        type: "turn.started",
      },
      {
        data: {
          deliveryId: "delivery_1",
          parts: [{ kind: "text", text: "Plan me a week." }],
          turnId: "turn_1",
        },
        scope: { turnId: "turn_1" },
        type: "delivery.consumed",
      }
    );

    for (let count = 0; count < 20; count += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve runs a turn's model calls one after another.
      await call("turn_1", usageOf(0.01));
    }

    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: true,
    });
  });

  it("doesn't report a failed call's missing cost", async () => {
    const { emit, request } = session();

    await emit(modelRequested("turn_1", "run_failed"));
    await emit(modelSettled("turn_1", "run_failed", "failed"));

    expect(observability.reportError).not.toHaveBeenCalled();
    await expect(request("turn_1")).resolves.toStrictEqual({
      cancelled: false,
    });
  });
});

describe("reported call cost", () => {
  it("is the call's reported cost, free calls included", () => {
    expect(reportedCostUsd({ costUsd: 0.0123 })).toBe(0.0123);
    expect(reportedCostUsd({ costUsd: 0 })).toBe(0);
  });

  it("is null, to be reported, when the call reported no usable cost", () => {
    expect(reportedCostUsd(undefined)).toBeNull();
    expect(reportedCostUsd({})).toBeNull();
    expect(reportedCostUsd({ costUsd: Number.NaN })).toBeNull();
    expect(reportedCostUsd({ costUsd: -1 })).toBeNull();
  });
});
