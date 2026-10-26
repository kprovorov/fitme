import { memoryRateLimiter, type RateLimitResult } from "@fitme/rate-limit";
import { describe, expect, it, vi } from "vitest";
import { type RateLimiter, rateLimiterFromEnv } from "../rate-limit.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const MINUTE_MS = 60_000;

/** A clock tests move by hand. */
const fakeClock = (start = Date.UTC(2026, 9, 23)) => {
  let time = start;
  return {
    advance: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
};

const services = fakeServices({ getProfile: () => Promise.resolve(null) });

/** The app limited to `limit` a minute in memory, on `clock`. */
const limitedApp = (clock = fakeClock(), limit = 3) =>
  testApp({
    rateLimiter: memoryRateLimiter({
      limit,
      now: clock.now,
      windowMs: MINUTE_MS,
    }),
    services,
  });

const requestTimes = async (
  app: ReturnType<typeof testApp>["app"],
  times: number,
  path = "/v1/profile",
  headers: Record<string, string> = signedInAs("user_alice")
) => {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one at a time, so the statuses come back in the order they were counted
    statuses.push((await app.request(path, { headers })).status);
  }
  return statuses;
};

describe("rate limiting", () => {
  it("answers a User's 301st request within a minute with 429 and Retry-After", {
    timeout: 30_000,
  }, async () => {
    const clock = fakeClock();
    const { app, reported } = limitedApp(clock, 300);

    const statuses = await requestTimes(app, 300);
    clock.advance(45_000);
    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(statuses).toEqual(new Array(300).fill(200));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(await response.json()).toEqual({
      error: {
        code: "rate_limited",
        message:
          "Too many requests, retry after the Retry-After header's seconds",
      },
    });
    expect(reported).toEqual([]);
  });

  it("resets the window after a minute", async () => {
    const clock = fakeClock();
    const { app } = limitedApp(clock);

    await requestTimes(app, 4);
    clock.advance(MINUTE_MS);

    expect(await requestTimes(app, 3)).toEqual([200, 200, 200]);
  });

  it("counts each User separately", async () => {
    const { app } = limitedApp();

    await requestTimes(app, 4);
    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_bob"),
    });

    expect(response.status).toBe(200);
  });

  it("counts requests to unknown routes too", async () => {
    const { app } = limitedApp();

    expect(await requestTimes(app, 3, "/nope")).toEqual([404, 404, 404]);
    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(429);
  });

  it.each([
    "/health",
    "/v1/client-config",
    "/v1/arnold/models",
    "/v1/muscle-groups",
  ])("never counts %s, token or not", async (path) => {
    const limit = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: false, retryAfterSeconds: 60 })
    );
    const { app } = testApp({ rateLimiter: { limit } });

    const withToken = await app.request(path, {
      headers: signedInAs("user_alice"),
    });
    const withoutToken = await app.request(path);

    expect(withToken.status).toBe(200);
    expect(withoutToken.status).toBe(200);
    expect(limit).not.toHaveBeenCalled();
  });

  it("checks the token before counting", async () => {
    const limit = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: true })
    );
    const { app } = testApp({ rateLimiter: { limit } });

    const response = await app.request("/v1/profile");

    expect(response.status).toBe(401);
    expect(limit).not.toHaveBeenCalled();
  });

  it("counts the User in their own bucket", async () => {
    const limit = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: true })
    );
    const { app } = testApp({ rateLimiter: { limit }, services });

    await app.request("/v1/profile", { headers: signedInAs("user_alice") });

    expect(limit).toHaveBeenCalledWith("user:user_alice");
  });

  it("serves the request and reports once when the limiter throws", async () => {
    const outage = new Error("Upstash is down");
    const { app, reported } = testApp({
      rateLimiter: { limit: () => Promise.reject(outage) },
      services,
    });

    const response = await app.request("/v1/profile", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).cause).toBe(outage);
  });

  it("serves the request and reports once when the limiter takes over 1 s", async () => {
    vi.useFakeTimers();
    const { app, reported } = testApp({
      rateLimiter: { limit: () => new Promise(() => undefined) },
      services,
    });

    let settled = false;
    const pending = Promise.resolve(
      app.request("/v1/profile", { headers: signedInAs("user_alice") })
    ).finally(() => {
      settled = true;
    });
    // Token verification is async, so the limiter's timer starts some ticks in.
    while (!settled) {
      // biome-ignore lint/performance/noAwaitInLoops: each step lets the request reach its next timer
      await vi.advanceTimersByTimeAsync(100);
    }
    const response = await pending;
    vi.useRealTimers();

    expect(response.status).toBe(200);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).cause).toEqual(
      new Error("Rate limiter timed out after 1000 ms")
    );
  });
});

describe("rateLimiterFromEnv", () => {
  it("limits each User to 300 a minute by default", async () => {
    const limiter = rateLimiterFromEnv({ NODE_ENV: "development" });

    const results: RateLimitResult[] = [];
    for (let i = 0; i < 301; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: counted in order
      results.push(await limiter.limit("user:user_alice"));
    }

    expect(results.at(-2)).toEqual({ allowed: true });
    expect(results.at(-1)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });

  it("takes the limit and window from the environment", async () => {
    const limiter = rateLimiterFromEnv({
      NODE_ENV: "development",
      RATE_LIMIT_REQUESTS: "2",
      RATE_LIMIT_WINDOW_SECONDS: "10",
    });

    await limiter.limit("user:user_alice");
    await limiter.limit("user:user_alice");

    expect(await limiter.limit("user:user_alice")).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
  });

  it.each([
    ["RATE_LIMIT_REQUESTS", "lots"],
    ["RATE_LIMIT_REQUESTS", "0"],
    ["RATE_LIMIT_WINDOW_SECONDS", "-5"],
    ["RATE_LIMIT_WINDOW_SECONDS", "1.5"],
  ])("refuses to start with %s=%s", (name, value) => {
    expect(() =>
      rateLimiterFromEnv({ NODE_ENV: "development", [name]: value })
    ).toThrow(`${name} must be a positive integer, got "${value}"`);
  });

  it("refuses to start in production without Upstash", () => {
    expect(() => rateLimiterFromEnv({ NODE_ENV: "production" })).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      })
    ).toThrow();
  });

  it("uses Upstash in production when it's configured", () => {
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_TOKEN: "token",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      })
    ).not.toThrow();
  });

  it("uses the in-memory limiter outside production without Upstash", async () => {
    const limiter = rateLimiterFromEnv({ NODE_ENV: "development" });

    expect(await limiter.limit("user:user_alice")).toEqual({ allowed: true });
  });

  it("uses the in-memory limiter on a Vercel preview without Upstash", async () => {
    const limiter = rateLimiterFromEnv({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
    });

    expect(await limiter.limit("user:user_alice")).toEqual({ allowed: true });
  });
});
