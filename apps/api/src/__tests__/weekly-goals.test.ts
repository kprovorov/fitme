import { memoryRateLimiter } from "@fitme/rate-limit";
import { describe, expect, it } from "vitest";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const changes = [
  { recorded_at: "2026-10-01T10:00:00.123456+00:00", target: 3 },
  { recorded_at: "2026-10-14T18:30:00+00:00", target: null },
  { recorded_at: "2026-10-20T07:00:00+00:00", target: 4 },
];

describe("GET /v1/weekly-goals", () => {
  it("answers the signed-in User's Weekly goal changes, oldest first", async () => {
    const { app, servicesFor } = testApp({
      services: fakeServices({
        getWeeklyGoals: () => Promise.resolve({ changes, streak: 11 }),
      }),
    });

    const response = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: changes, streak: 11 });
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers an empty list before tracking started", async () => {
    const { app } = testApp({
      services: fakeServices({
        getWeeklyGoals: () => Promise.resolve({ changes: [], streak: 0 }),
      }),
    });

    const response = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(await response.json()).toEqual({ data: [], streak: 0 });
  });

  it("never shows fields beyond the contract", async () => {
    const { app } = testApp({
      services: fakeServices({
        getWeeklyGoals: () =>
          Promise.resolve({
            changes: changes.map((change) => ({
              ...change,
              user_id: "user_alice",
            })),
            streak: 11,
          }),
      }),
    });

    const response = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(await response.json()).toEqual({ data: changes, streak: 11 });
  });

  it("passes the device timezone through and defaults old clients to UTC", async () => {
    const zones: string[] = [];
    const { app } = testApp({
      services: fakeServices({
        getWeeklyGoals: (zone) => {
          zones.push(zone);
          return Promise.resolve({ changes: [], streak: 0 });
        },
      }),
    });
    for (const path of [
      "/v1/weekly-goals?time_zone=Europe%2FKyiv",
      "/v1/weekly-goals",
    ]) {
      expect(
        // biome-ignore lint/performance/noAwaitInLoops: ordered timezone requests
        (await app.request(path, { headers: signedInAs("user_alice") })).status
      ).toBe(200);
    }
    expect(zones).toEqual(["Europe/Kyiv", "UTC"]);
    const invalid = await Promise.all(
      ["invalid", "%2B02%3A00", ""].map((zone) =>
        app.request(`/v1/weekly-goals?time_zone=${zone}`, {
          headers: signedInAs("user_alice"),
        })
      )
    );
    expect(invalid.map((response) => response.status)).toEqual([400, 400, 400]);
  });

  it("refuses a request without a session token", async () => {
    const { app, servicesFor } = testApp({});

    const response = await app.request("/v1/weekly-goals");

    expect(response.status).toBe(401);
    expect(servicesFor).toEqual([]);
  });

  it.each(["GMT+1", "GMT+05:30", "GMT-03:30", "UTC+12:45"])(
    "accepts the fixed-offset calendar timezone %s without losing goal data",
    async (zone) => {
      const zones: string[] = [];
      const { app } = testApp({
        services: fakeServices({
          getWeeklyGoals: (timeZone) => {
            zones.push(timeZone);
            return Promise.resolve({ changes, streak: 2 });
          },
        }),
      });
      const response = await app.request(
        `/v1/weekly-goals?time_zone=${encodeURIComponent(zone)}`,
        { headers: signedInAs("user_alice") }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: changes, streak: 2 });
      expect(zones).toEqual([zone]);
    }
  );

  it.each(["GMT+24", "GMT-03:60", "GMT+1DST", "GMT+9999"])(
    "rejects the malformed fixed-offset timezone %s",
    async (zone) => {
      const { app, servicesFor } = testApp({});
      const response = await app.request(
        `/v1/weekly-goals?time_zone=${encodeURIComponent(zone)}`,
        { headers: signedInAs("user_alice") }
      );
      expect(response.status).toBe(400);
      expect(servicesFor).toEqual([]);
    }
  );

  it("counts toward the caller's rate limit", async () => {
    const { app } = testApp({
      rateLimiter: memoryRateLimiter({
        limit: 1,
        now: () => 0,
        windowMs: 60_000,
      }),
      services: fakeServices({
        getWeeklyGoals: () => Promise.resolve({ changes: [], streak: 0 }),
      }),
    });

    const first = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });
    const second = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});
