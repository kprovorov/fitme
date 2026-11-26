import type { CloseForgottenWorkoutSessionResult } from "@fitme/services/workout-sessions";
import { describe, expect, it, vi } from "vitest";

import {
  forgottenWorkoutSessions,
  MAX_FAILURES_IN_A_ROW,
  RUN_BUDGET_MS,
} from "../jobs/forgotten-workout-sessions";
import type { ForgottenWorkoutSessionsDeps } from "../jobs/forgotten-workout-sessions";
import { AlreadyReportedError } from "../reported";

type Status = CloseForgottenWorkoutSessionResult["status"];

/**
 * A run over `sessions` (each id with what closing it answers, or `Error` to
 * fail), recording what it closed, logged and reported.
 */
const harness = (
  sessions: Record<string, Status | Error>,
  overrides: Partial<ForgottenWorkoutSessionsDeps> = {}
) => {
  const closed: string[] = [];
  const logs: string[] = [];
  const reports: { error: unknown; tags?: Record<string, string> }[] = [];

  const deps: ForgottenWorkoutSessionsDeps = {
    closeSession: (sessionId) => {
      closed.push(sessionId);
      const outcome = sessions[sessionId];

      return outcome instanceof Error
        ? Promise.reject(outcome)
        : Promise.resolve(outcome ?? "left_alone");
    },
    listSessions: () => Promise.resolve(Object.keys(sessions)),
    log: (message) => {
      logs.push(message);
    },
    now: () => 0,
    reportError: (error, tags) => {
      reports.push({ error, tags });

      return Promise.resolve();
    },
    ...overrides,
  };

  return { closed, logs, reports, run: forgottenWorkoutSessions(deps) };
};

describe("the forgotten-workout-sessions job", () => {
  it("closes every listed Workout Session, in order, and logs the counts", async () => {
    const { closed, logs, reports, run } = harness({
      a: "finished",
      b: "discarded",
      c: "left_alone",
      d: "finished",
    });

    await run();

    expect(closed).toStrictEqual(["a", "b", "c", "d"]);
    expect(reports).toStrictEqual([]);
    expect(logs).toStrictEqual([
      "forgotten-workout-sessions: 4 listed, 2 finished, 1 discarded, 1 left alone, 0 failed, 0 postponed",
    ]);
  });

  it("closes one Workout Session at a time", async () => {
    let open = 0;
    let most = 0;

    const { run } = harness(
      { a: "finished", b: "finished", c: "finished" },
      {
        closeSession: async () => {
          open += 1;
          most = Math.max(most, open);
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
          open -= 1;

          return "finished";
        },
      }
    );

    await run();

    expect(most).toBe(1);
  });

  it("succeeds with nothing to do", async () => {
    const { closed, logs, run } = harness({});

    await expect(run()).resolves.toBeUndefined();
    expect(closed).toStrictEqual([]);
    expect(logs).toStrictEqual([
      "forgotten-workout-sessions: 0 listed, 0 finished, 0 discarded, 0 left alone, 0 failed, 0 postponed",
    ]);
  });

  it("succeeds when every one is left alone", async () => {
    const { run } = harness({ a: "left_alone", b: "left_alone" });

    await expect(run()).resolves.toBeUndefined();
  });

  it("reports one that fails by its id, closes the rest, then fails the run", async () => {
    const failure = new Error("deadlock");

    const { closed, logs, reports, run } = harness({
      a: "finished",
      b: failure,
      c: "discarded",
    });

    const result = run();

    await expect(result).rejects.toBeInstanceOf(AlreadyReportedError);
    await expect(result).rejects.toThrow(
      "1 of 3 Forgotten Workout Sessions failed to close"
    );
    expect(closed).toStrictEqual(["a", "b", "c"]);
    expect(reports).toStrictEqual([
      { error: failure, tags: { workout_session_id: "b" } },
    ]);
    expect(logs).toStrictEqual([
      "forgotten-workout-sessions: 3 listed, 1 finished, 1 discarded, 0 left alone, 1 failed, 0 postponed",
    ]);
  });

  it("fails the run on a failing list, closing nothing", async () => {
    const failure = new Error("no database");
    const closeSession = vi.fn<ForgottenWorkoutSessionsDeps["closeSession"]>();

    const { logs, reports, run } = harness(
      {},
      { closeSession, listSessions: () => Promise.reject(failure) }
    );

    await expect(run()).rejects.toBe(failure);
    expect(closeSession).not.toHaveBeenCalled();
    expect(reports).toStrictEqual([]);
    expect(logs).toStrictEqual([]);
  });

  it("starts no new close once its budget is spent, leaving the rest to the next run", async () => {
    let clock = 0;

    const { closed, logs, run } = harness(
      { a: "finished", b: "finished", c: "finished", d: "finished" },
      {
        closeSession: (sessionId) => {
          closed.push(sessionId);
          clock += RUN_BUDGET_MS / 2;

          return Promise.resolve("finished");
        },
        now: () => clock,
      }
    );

    await expect(run()).resolves.toBeUndefined();
    expect(closed).toStrictEqual(["a", "b"]);
    expect(logs).toStrictEqual([
      "forgotten-workout-sessions: 4 listed, 2 finished, 0 discarded, 0 left alone, 0 failed, 2 postponed",
    ]);
  });

  it("logs ids and counts only, never what a failure says", async () => {
    const { logs, reports, run } = harness({
      a: Object.assign(new Error("Failed query: select squat"), {
        params: ["barbell-back-squat", 100],
        query: "select squat",
      }),
    });

    await expect(run()).rejects.toThrow(AlreadyReportedError);

    // The failure itself goes to reportError, which sanitizes it
    expect(reports).toHaveLength(1);
    expect(logs.join("\n")).not.toMatch(/squat|select/u);
  });

  it("is harmless run twice: a second run leaves alone what the first closed", async () => {
    const closedBefore = new Set<string>();

    const closeSession = (sessionId: string): Promise<Status> => {
      if (closedBefore.has(sessionId)) {
        return Promise.resolve("left_alone");
      }

      closedBefore.add(sessionId);

      return Promise.resolve("finished");
    };

    const first = harness({ a: "finished" }, { closeSession });
    const second = harness({ a: "finished" }, { closeSession });

    await Promise.all([first.run(), second.run()]);

    expect([...first.logs, ...second.logs].toSorted()).toStrictEqual([
      "forgotten-workout-sessions: 1 listed, 0 finished, 0 discarded, 1 left alone, 0 failed, 0 postponed",
      "forgotten-workout-sessions: 1 listed, 1 finished, 0 discarded, 0 left alone, 0 failed, 0 postponed",
    ]);
  });

  it("stops after too many closes fail in a row, leaving the rest to the next run", async () => {
    const sessions: Record<string, Status | Error> = { a: "finished" };

    for (let i = 0; i < MAX_FAILURES_IN_A_ROW + 3; i += 1) {
      sessions[`f${i}`] = new Error("connection refused");
    }

    const { closed, logs, reports, run } = harness(sessions);

    await expect(run()).rejects.toThrow(AlreadyReportedError);
    expect(closed).toHaveLength(1 + MAX_FAILURES_IN_A_ROW);
    expect(reports).toHaveLength(MAX_FAILURES_IN_A_ROW);
    expect(logs).toStrictEqual([
      `forgotten-workout-sessions: ${MAX_FAILURES_IN_A_ROW + 4} listed, 1 finished, 0 discarded, 0 left alone, ${MAX_FAILURES_IN_A_ROW} failed, 3 postponed`,
    ]);
  });

  it("carries on when a failure can't be reported", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);

    const { closed, logs, run } = harness(
      { a: new Error("deadlock"), b: "finished" },
      { reportError: () => Promise.reject(new Error("Sentry down")) }
    );

    await expect(run()).rejects.toThrow(AlreadyReportedError);
    expect(closed).toStrictEqual(["a", "b"]);
    expect(logs).toStrictEqual([
      "forgotten-workout-sessions: 2 listed, 1 finished, 0 discarded, 0 left alone, 1 failed, 0 postponed",
    ]);
  });
});
