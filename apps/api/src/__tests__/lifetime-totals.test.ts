import { memoryRateLimiter } from "@fitme/rate-limit";
import type { LifetimeTotals } from "@fitme/services/lifetime-totals";
import { describe, expect, it } from "vitest";

import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const PATH = "/v1/workout-sessions/totals";

const NONE: LifetimeTotals = {
  duration_seconds: 0,
  volume: 0,
  weight_unit: "kg",
  workout_count: 0,
};

/** A facade whose Lifetime totals answer `totals`, counting its calls. */
const totalling = (totals: LifetimeTotals) => {
  let calls = 0;

  const services = fakeServices({
    getLifetimeTotals: () => {
      calls += 1;

      return Promise.resolve(totals);
    },
  });

  return { calls: () => calls, services };
};

/** The status and body of the Lifetime totals as `user_alice`. */
const totalsOf = async (app: ReturnType<typeof testApp>["app"]) => {
  const response = await app.request(PATH, {
    headers: signedInAs("user_alice"),
  });

  return { body: await response.json(), response };
};

describe("gET /v1/workout-sessions/totals", () => {
  it("answers the User's Lifetime totals with their weight unit", async () => {
    const { calls, services } = totalling({
      duration_seconds: 131_400,
      volume: 182_400.5,
      weight_unit: "kg",
      workout_count: 42,
    });

    const { app, reported, servicesFor } = testApp({ services });

    const { body, response } = await totalsOf(app);

    expect(response.status).toBe(200);
    expect(body).toStrictEqual({
      data: { duration_seconds: 131_400, volume: 182_400.5, workout_count: 42 },
      weight_unit: "kg",
    });
    expect(calls()).toBe(1);
    expect(servicesFor).toStrictEqual(["user_alice"]);
    expect(reported).toStrictEqual([]);
  });

  it("answers the volume in lbs for a User on the US or UK system", async () => {
    const { services } = totalling({
      duration_seconds: 3600,
      volume: 402_100,
      weight_unit: "lbs",
      workout_count: 3,
    });

    const { app } = testApp({ services });

    const { body } = await totalsOf(app);

    expect(body).toStrictEqual({
      data: { duration_seconds: 3600, volume: 402_100, workout_count: 3 },
      weight_unit: "lbs",
    });
  });

  it("answers zeros for a User with no qualifying Workout Session", async () => {
    const { app } = testApp({ services: totalling(NONE).services });

    const { body } = await totalsOf(app);

    expect(body).toStrictEqual({
      data: { duration_seconds: 0, volume: 0, workout_count: 0 },
      weight_unit: "kg",
    });
  });

  it("strips fields beyond the contract", async () => {
    const withExtra = { ...NONE, user_id: "user_alice", workout_count: 1 };

    const services = fakeServices({
      getLifetimeTotals: () => Promise.resolve(withExtra),
    });

    const { app } = testApp({ services });

    const { body } = await totalsOf(app);

    expect(body).toStrictEqual({
      data: { duration_seconds: 0, volume: 0, workout_count: 1 },
      weight_unit: "kg",
    });
  });

  it("answers 401 without a token", async () => {
    const { app, servicesFor } = testApp();

    const response = await app.request(PATH);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(servicesFor).toStrictEqual([]);
  });

  it("answers 429 with Retry-After once the User is over their limit", async () => {
    const { calls, services } = totalling(NONE);

    const { app, reported } = testApp({
      rateLimiter: memoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      services,
    });

    const first = await totalsOf(app);
    const second = await totalsOf(app);

    expect([first.response.status, second.response.status]).toStrictEqual([
      200, 429,
    ]);
    expect(second.body.error.code).toBe("rate_limited");
    expect(Number(second.response.headers.get("Retry-After"))).toBeGreaterThan(
      0
    );
    expect(calls()).toBe(1);
    expect(reported).toStrictEqual([]);
  });
});
