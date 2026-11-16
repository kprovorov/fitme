import type * as Observability from "@fitme/observability/node";
import { describe, expect, it, vi } from "vitest";

import { hookSession } from "./hooks";
import type { EveEvent } from "./hooks";

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

const { default: failures } = await import("../agent/hooks/failures");

const failure = { code: "model_call_failed", message: "Upstream timed out" };

describe("failure hook", () => {
  it("reports a failed step with its session, turn and step", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { ...failure, sequence: 4, stepIndex: 2, turnId: "turn_1" },
      type: "step.failed",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "step.failed model_call_failed: Upstream timed out",
        name: "Arnold step.failed",
      }),
      { sessionId: "wrun_1", stepIndex: "2", turnId: "turn_1" }
    );
  });

  it("reports a failed turn with its session and turn", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { ...failure, sequence: 5, terminal: false, turnId: "turn_1" },
      type: "turn.failed",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "turn.failed model_call_failed: Upstream timed out",
        name: "Arnold turn.failed",
      }),
      { sessionId: "wrun_1", turnId: "turn_1" }
    );
  });

  it("reports a failed session with its session", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { ...failure, sessionId: "wrun_1" },
      type: "session.failed",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "session.failed model_call_failed: Upstream timed out",
        name: "Arnold session.failed",
      }),
      { sessionId: "wrun_1" }
    );
  });

  it("reports nothing for events that didn't fail", async () => {
    const { emit } = hookSession(failures);

    const fine: EveEvent[] = [
      {
        data: {
          modelId: "openai/gpt-6.1-terra",
          sequence: 1,
          stepIndex: 0,
          turnId: "turn_1",
        },
        type: "step.started",
      },
      {
        data: {
          finishReason: "stop",
          sequence: 2,
          stepIndex: 0,
          turnId: "turn_1",
          usage: { costUsd: 0.01 },
        },
        type: "step.completed",
      },
      { data: { sequence: 3, turnId: "turn_1" }, type: "turn.completed" },
      { data: { sequence: 4, turnId: "turn_2" }, type: "turn.cancelled" },
    ];

    for (const event of fine) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve hands a session's events to hooks in order.
      await expect(emit(event)).resolves.toStrictEqual({ cancelled: false });
    }

    expect(observability.reportError).not.toHaveBeenCalled();
  });
});
