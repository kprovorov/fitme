import { getCurrentScope, NodeClient } from "@sentry/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMonitored } from "../node";

const MONITOR = {
  checkinMarginMinutes: 5,
  maxRuntimeMinutes: 4,
  schedule: "*/10 * * * *",
  slug: "close-forgotten-workout-sessions",
  timezone: "UTC",
} as const;

const MONITOR_CONFIG = {
  checkin_margin: 5,
  max_runtime: 4,
  schedule: { type: "crontab", value: "*/10 * * * *" },
  timezone: "UTC",
};

type Send = ReturnType<
  NonNullable<ConstructorParameters<typeof NodeClient>[0]["transport"]>
>["send"];

interface SentCheckIn {
  check_in_id: string;
  duration?: number;
  monitor_config?: typeof MONITOR_CONFIG;
  monitor_slug: string;
  status: string;
}

const FAILURE = new Error("user_123 failed");

describe("a monitored run", () => {
  const scope = getCurrentScope();

  const previousClient = scope.getClient();

  const send = vi.fn<Send>();

  const flush = vi.fn<() => Promise<boolean>>();

  let client: NodeClient;

  beforeEach(() => {
    send.mockReset().mockResolvedValue({ statusCode: 200 });
    flush.mockReset().mockResolvedValue(true);
    client = new NodeClient({
      dsn: "https://public@example.com/1",
      environment: "production",
      integrations: [],
      release: "abc123",
      stackParser: () => [],
      transport: () => ({ flush, send }),
    });
    scope.setClient(client);
    vi.spyOn(console, "error").mockReturnValue(undefined);
  });

  afterEach(async () => {
    vi.useRealTimers();
    scope.setUser(null);
    scope.setTag("secret", undefined);
    scope.setClient(previousClient);
    flush.mockReset().mockResolvedValue(true);
    await client.close();
    vi.restoreAllMocks();
  });

  /** What each check-in sent to Sentry holds, undefined fields left out. */
  const sentCheckIns = (): SentCheckIn[] =>
    send.mock.calls.flatMap(([[, items]]) =>
      items.map(([, payload]): SentCheckIn => {
        const body = JSON.stringify(payload);

        return JSON.parse(body);
      })
    );

  it("checks in when it starts and as ok when it resolves, answering its value", async () => {
    let sentBeforeRun = 0;

    const value = await runMonitored(MONITOR, async () => {
      sentBeforeRun = send.mock.calls.length;

      return await Promise.resolve({ closed: 3 });
    });

    expect(value).toStrictEqual({ closed: 3 });
    expect(sentBeforeRun).toBe(1);

    const [started, ended, ...rest] = sentCheckIns();
    expect(rest).toStrictEqual([]);
    expect(started).toMatchObject({
      monitor_config: MONITOR_CONFIG,
      monitor_slug: MONITOR.slug,
      status: "in_progress",
    });
    expect(ended).toMatchObject({
      check_in_id: started?.check_in_id,
      monitor_config: MONITOR_CONFIG,
      monitor_slug: MONITOR.slug,
      status: "ok",
    });
  });

  it.each([
    ["rejects", () => Promise.reject(FAILURE)],
    [
      "throws",
      () => {
        throw FAILURE;
      },
    ],
  ])("checks in as failed when it %s, with the same error", async (_, fail) => {
    await expect(runMonitored(MONITOR, fail)).rejects.toBe(FAILURE);

    expect(sentCheckIns().map(({ status }) => status)).toStrictEqual([
      "in_progress",
      "error",
    ]);
    expect(JSON.stringify(sentCheckIns())).not.toContain("user_123");
  });

  it("carries the slug, status, duration and schedule, and only what the SDK adds to any check-in", async () => {
    // Only the clock: Sentry's flush waits on real timers
    vi.useFakeTimers({ toFake: ["performance"] });
    scope.setUser({ id: "user_123" });
    scope.setTag("secret", "tag");

    await runMonitored(MONITOR, async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });

    const common = {
      check_in_id: expect.any(String),
      contexts: {
        trace: { span_id: expect.any(String), trace_id: expect.any(String) },
      },
      environment: "production",
      monitor_config: MONITOR_CONFIG,
      monitor_slug: MONITOR.slug,
      release: "abc123",
    };

    expect(sentCheckIns()).toStrictEqual([
      { ...common, status: "in_progress" },
      { ...common, duration: 1.5, status: "ok" },
    ]);
  });

  it("waits for each check-in's delivery, for at most 2 seconds", async () => {
    let deliver: (delivered: boolean) => void = () => undefined;

    // oxlint-disable-next-line promise/avoid-new -- a delivery the test ends
    const delivery = new Promise<boolean>((resolve) => {
      deliver = resolve;
    });

    flush.mockResolvedValueOnce(true).mockReturnValueOnce(delivery);
    const settled = vi.fn<() => void>();

    const run = async () => {
      await runMonitored(MONITOR, () => Promise.resolve());
      settled();
    };

    const result = run();

    await vi.waitFor(() => {
      expect(flush).toHaveBeenCalledTimes(2);
    });
    expect(settled).not.toHaveBeenCalled();

    deliver(true);
    await result;
    expect(flush.mock.calls).toStrictEqual([[2000], [2000]]);
  });

  it.each([
    ["refuses", () => send.mockResolvedValue({ statusCode: 429 })],
    ["drops", () => send.mockRejectedValue(new Error("network down"))],
    [
      "can't serialize",
      () =>
        send.mockImplementation(() => {
          throw new Error("bad envelope");
        }),
    ],
    ["doesn't deliver in time", () => flush.mockResolvedValue(false)],
    [
      "fails to flush",
      () => flush.mockRejectedValue(new Error("flush failed")),
    ],
  ])("never fails over a check-in Sentry %s", async (_, breakSentry) => {
    breakSentry();

    await expect(
      runMonitored(MONITOR, () => Promise.resolve("done"))
    ).resolves.toBe("done");

    await expect(
      runMonitored(MONITOR, () => Promise.reject(FAILURE))
    ).rejects.toBe(FAILURE);
  });

  it("still checks in at the end when the first check-in failed", async () => {
    vi.spyOn(client, "captureCheckIn").mockImplementationOnce(() => {
      throw new Error("bad envelope");
    });

    await runMonitored(MONITOR, () => Promise.resolve());

    expect(sentCheckIns()).toMatchObject([
      { monitor_config: MONITOR_CONFIG, status: "ok" },
    ]);
  });

  it("just runs without SENTRY_DSN", async () => {
    scope.setClient(undefined);

    await expect(
      runMonitored(MONITOR, () => Promise.resolve("done"))
    ).resolves.toBe("done");

    await expect(
      runMonitored(MONITOR, () => Promise.reject(FAILURE))
    ).rejects.toBe(FAILURE);
    expect(send).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
});
