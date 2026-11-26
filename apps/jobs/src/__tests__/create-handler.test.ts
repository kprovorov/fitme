import type { CronMonitor } from "@fitme/observability/node";
import {
  CLOUD_EVENT_ID_HEADER,
  CLOUD_EVENT_SOURCE_HEADER,
  CLOUD_EVENT_SPEC_VERSION_HEADER,
  CLOUD_EVENT_TYPE_HEADER,
  SCHEDULE_CLOUD_EVENT_TYPE,
  SCHEDULE_EXPRESSION_HEADER,
  SCHEDULE_ID_HEADER,
  SCHEDULE_NAME_HEADER,
  SCHEDULE_NAMESPACE_HEADER,
  SCHEDULE_SCHEDULED_AT_HEADER,
  SCHEDULE_SOURCE_HEADER,
} from "@vercel/schedules";
import { describe, expect, it, vi } from "vitest";

import { createHandler } from "../create-handler";
import { FORGOTTEN_WORKOUT_SESSIONS_MONITOR } from "../monitors";
import { AlreadyReportedError } from "../reported";

const URL = "https://jobs.test/";

/** A run as Vercel Schedules delivers it. */
const scheduledRun = () =>
  new Request(URL, {
    headers: {
      [CLOUD_EVENT_ID_HEADER]: "execution",
      [CLOUD_EVENT_SOURCE_HEADER]: "schedules",
      [CLOUD_EVENT_SPEC_VERSION_HEADER]: "1.0",
      [CLOUD_EVENT_TYPE_HEADER]: SCHEDULE_CLOUD_EVENT_TYPE,
      [SCHEDULE_EXPRESSION_HEADER]: "*/10 * * * *",
      [SCHEDULE_ID_HEADER]: "schedule",
      [SCHEDULE_NAMESPACE_HEADER]: "default",
      [SCHEDULE_NAME_HEADER]: "forgotten-workout-sessions",
      [SCHEDULE_SCHEDULED_AT_HEADER]: "2026-11-25T10:00:00.000Z",
      [SCHEDULE_SOURCE_HEADER]: "static",
    },
    method: "POST",
  });

const reporter = () =>
  vi.fn<(error: unknown) => Promise<void>>(() => Promise.resolve());

/** A stand-in for the cron monitor, recording each run's check-ins. */
const monitorRecorder = () => {
  const checkIns: string[] = [];

  const runMonitored = async <T>(
    monitor: CronMonitor,
    run: () => Promise<T>
  ): Promise<T> => {
    checkIns.push(`${monitor.slug} in_progress`);

    try {
      const value = await run();
      checkIns.push(`${monitor.slug} ok`);

      return value;
    } catch (error) {
      checkIns.push(`${monitor.slug} error`);
      throw error;
    }
  };

  return { checkIns, runMonitored };
};

const MONITOR = FORGOTTEN_WORKOUT_SESSIONS_MONITOR;

describe("a scheduled function's handler", () => {
  it("runs the job and answers 200", async () => {
    const job = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const reportError = reporter();

    const { checkIns, runMonitored } = monitorRecorder();

    const response = await createHandler(job, MONITOR, {
      reportError,
      runMonitored,
    })(scheduledRun());

    expect(response.status).toBe(200);
    expect(job).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
    expect(checkIns).toStrictEqual([
      "forgotten-workout-sessions in_progress",
      "forgotten-workout-sessions ok",
    ]);
  });

  it("reports a failing job and fails the run and its monitor", async () => {
    const failure = new Error("boom");
    const reportError = reporter();
    const { checkIns, runMonitored } = monitorRecorder();

    const handler = createHandler(() => Promise.reject(failure), MONITOR, {
      reportError,
      runMonitored,
    });

    await expect(handler(scheduledRun())).rejects.toBe(failure);
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(checkIns).toStrictEqual([
      "forgotten-workout-sessions in_progress",
      "forgotten-workout-sessions error",
    ]);
  });

  it("fails the run without reporting again what the job reported", async () => {
    const reportError = reporter();
    const { checkIns, runMonitored } = monitorRecorder();

    const handler = createHandler(
      () => Promise.reject(new AlreadyReportedError("1 of 2 failed")),
      MONITOR,
      { reportError, runMonitored }
    );

    await expect(handler(scheduledRun())).rejects.toThrow("1 of 2 failed");
    expect(reportError).not.toHaveBeenCalled();
    expect(checkIns.at(-1)).toBe("forgotten-workout-sessions error");
  });

  it("fails the run on a query error without its SQL or parameters", async () => {
    const failure = Object.assign(new Error("Failed query: select secret"), {
      params: ["secret"],
      query: "select secret",
    });

    const handler = createHandler(() => Promise.reject(failure), MONITOR, {
      reportError: reporter(),
      runMonitored: monitorRecorder().runMonitored,
    });

    await expect(handler(scheduledRun())).rejects.toThrow(
      "Database query failed (SQLSTATE unknown)"
    );
  });

  it("doesn't run the job for a request no schedule sent", async () => {
    const job = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const { checkIns, runMonitored } = monitorRecorder();

    const handler = createHandler(job, MONITOR, {
      reportError: reporter(),
      runMonitored,
    });

    const response = await handler(new Request(URL, { method: "POST" }));

    expect(response.status).toBe(400);
    expect(job).not.toHaveBeenCalled();
    expect(checkIns).toStrictEqual([]);
  });
});
