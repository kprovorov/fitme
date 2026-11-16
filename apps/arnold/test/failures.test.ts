import type * as Observability from "@fitme/observability/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const error = { code: "model_call_failed", message: "Upstream timed out" };

describe("failure hook", () => {
  beforeEach(() => {
    observability.reportError.mockClear();
  });

  it("reports a failed model call with its session, turn and run", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { error, outcome: "failed", runId: "run_2" },
      scope: { runId: "run_2", turnId: "turn_1" },
      type: "model.settled",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "model.settled failed model_call_failed: Upstream timed out",
        name: "Arnold model.settled failed",
      }),
      { runId: "run_2", sessionId: "wrun_1", turnId: "turn_1" }
    );
  });

  it("reports a failed context change's model call without a turn", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { error, outcome: "failed", runId: "run_3" },
      scope: { changeId: "change_1", runId: "run_3" },
      type: "model.settled",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.any(Error),
      { runId: "run_3", sessionId: "wrun_1" }
    );
  });

  it("reports a failed turn with its session and turn", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { error, outcome: "failed", turnId: "turn_1" },
      scope: { turnId: "turn_1" },
      type: "turn.settled",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "turn.settled failed model_call_failed: Upstream timed out",
        name: "Arnold turn.settled failed",
      }),
      { sessionId: "wrun_1", turnId: "turn_1" }
    );
  });

  it("reports a failed session with its session", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { cause: { turnId: "turn_1" }, error, outcome: "failed" },
      type: "session.ended",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "session.ended failed model_call_failed: Upstream timed out",
        name: "Arnold session.ended failed",
      }),
      { sessionId: "wrun_1" }
    );
  });

  it("reports a failure that names no error", async () => {
    const { emit } = hookSession(failures);

    await emit({
      data: { outcome: "failed", turnId: "turn_1" },
      scope: { turnId: "turn_1" },
      type: "turn.settled",
    });

    expect(observability.reportError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: "turn.settled failed unknown: no error recorded",
      }),
      { sessionId: "wrun_1", turnId: "turn_1" }
    );
  });

  it("reports nothing for events that didn't fail", async () => {
    const { emit } = hookSession(failures);

    const fine: EveEvent[] = [
      {
        data: { owner: { turnId: "turn_1" }, runId: "run_1" },
        scope: { runId: "run_1", turnId: "turn_1" },
        type: "model.requested",
      },
      {
        data: { finishReason: "stop", outcome: "completed", runId: "run_1" },
        scope: { runId: "run_1", turnId: "turn_1" },
        type: "model.settled",
      },
      {
        data: { outcome: "interrupted", runId: "run_2" },
        scope: { runId: "run_2", turnId: "turn_2" },
        type: "model.settled",
      },
      {
        data: { outcome: "completed", turnId: "turn_1" },
        scope: { turnId: "turn_1" },
        type: "turn.settled",
      },
      {
        data: {
          cause: { hook: "turn-limits" },
          outcome: "cancelled",
          turnId: "turn_2",
        },
        scope: { turnId: "turn_2" },
        type: "turn.settled",
      },
      { data: { outcome: "completed" }, type: "session.ended" },
    ];

    for (const event of fine) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- eve hands a session's events to hooks in order.
      await expect(emit(event)).resolves.toStrictEqual({ cancelled: false });
    }

    expect(observability.reportError).not.toHaveBeenCalled();
  });
});
