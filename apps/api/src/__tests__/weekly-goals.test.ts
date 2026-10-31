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
        listWeeklyGoalChanges: () => Promise.resolve(changes),
      }),
    });

    const response = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: changes });
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers an empty list before tracking started", async () => {
    const { app } = testApp({
      services: fakeServices({
        listWeeklyGoalChanges: () => Promise.resolve([]),
      }),
    });

    const response = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(await response.json()).toEqual({ data: [] });
  });

  it("never shows fields beyond the contract", async () => {
    const { app } = testApp({
      services: fakeServices({
        listWeeklyGoalChanges: () =>
          Promise.resolve(
            changes.map((change) => ({ ...change, user_id: "user_alice" }))
          ),
      }),
    });

    const response = await app.request("/v1/weekly-goals", {
      headers: signedInAs("user_alice"),
    });

    expect(await response.json()).toEqual({ data: changes });
  });

  it("refuses a request without a session token", async () => {
    const { app, servicesFor } = testApp({});

    const response = await app.request("/v1/weekly-goals");

    expect(response.status).toBe(401);
    expect(servicesFor).toEqual([]);
  });

  it("counts toward the caller's rate limit", async () => {
    const { app } = testApp({
      rateLimiter: memoryRateLimiter({
        limit: 1,
        now: () => 0,
        windowMs: 60_000,
      }),
      services: fakeServices({
        listWeeklyGoalChanges: () => Promise.resolve([]),
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
