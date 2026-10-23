import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  memoryRateLimiter,
  type RateLimiter,
  rateLimiterFromEnv,
} from "../index";

const MINUTE_MS = 60_000;

const perMinute = (limit: number) => ({ limit, windowMs: MINUTE_MS });

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

const limitTimes = async (limiter: RateLimiter, key: string, times: number) => {
  const results: boolean[] = [];
  for (let i = 0; i < times; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one at a time, so the results come back in the order they were counted
    results.push((await limiter.limit(key)).allowed);
  }
  return results;
};

describe("memoryRateLimiter", () => {
  it("allows the limit within a window, then refuses with the seconds left", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(3), now: clock.now });

    const allowed = await limitTimes(limiter, "user_alice", 3);
    clock.advance(45_000);

    expect(allowed).toEqual([true, true, true]);
    expect(await limiter.limit("user_alice")).toEqual({
      allowed: false,
      retryAfterSeconds: 15,
    });
  });

  it("rounds Retry-After up, never below a second", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(1), now: clock.now });

    await limiter.limit("user_alice");
    clock.advance(MINUTE_MS - 1);

    expect(await limiter.limit("user_alice")).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("starts a new window once the last one ends", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(2), now: clock.now });

    await limitTimes(limiter, "user_alice", 3);
    clock.advance(MINUTE_MS);

    expect(await limitTimes(limiter, "user_alice", 3)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("takes the window as a parameter", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({
      limit: 1,
      now: clock.now,
      windowMs: 10_000,
    });

    await limiter.limit("user_alice");
    clock.advance(4000);

    expect(await limiter.limit("user_alice")).toEqual({
      allowed: false,
      retryAfterSeconds: 6,
    });
    clock.advance(6000);
    expect(await limiter.limit("user_alice")).toEqual({ allowed: true });
  });

  it("counts each key in its own bucket", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(1), now: clock.now });

    await limitTimes(limiter, "user:user_alice", 2);

    expect(await limiter.limit("user:user_bob")).toEqual({ allowed: true });
    expect(await limiter.limit("client:abc")).toEqual({ allowed: true });
  });
});

describe("rateLimiterFromEnv", () => {
  const options = { ...perMinute(120), prefix: "test:user" };

  it("refuses to start in production without Upstash", () => {
    expect(() =>
      rateLimiterFromEnv({ NODE_ENV: "production" }, options)
    ).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
    expect(() =>
      rateLimiterFromEnv(
        {
          NODE_ENV: "production",
          UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        },
        options
      )
    ).toThrow();
    expect(() =>
      rateLimiterFromEnv(
        { NODE_ENV: "production", UPSTASH_REDIS_REST_TOKEN: "token" },
        options
      )
    ).toThrow();
  });

  it("uses the in-memory limiter with the given limit outside production without Upstash", async () => {
    const limiter = rateLimiterFromEnv(
      { NODE_ENV: "development" },
      { ...perMinute(2), prefix: "test:user" }
    );

    expect(await limitTimes(limiter, "user_alice", 3)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("uses the in-memory limiter on a Vercel preview without Upstash", async () => {
    const limiter = rateLimiterFromEnv(
      { NODE_ENV: "production", VERCEL_ENV: "preview" },
      { ...perMinute(2), prefix: "test:user" }
    );

    expect(await limitTimes(limiter, "user_alice", 3)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("uses Upstash in production when it's configured", () => {
    expect(() =>
      rateLimiterFromEnv(
        {
          NODE_ENV: "production",
          UPSTASH_REDIS_REST_TOKEN: "token",
          UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        },
        options
      )
    ).not.toThrow();
  });
});

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const recorder = () => {
    const reported: unknown[] = [];
    return {
      reportError: (error: unknown) => {
        reported.push(error);
        return Promise.resolve();
      },
      reported,
    };
  };

  it("answers the limiter's result for the key", async () => {
    const { reportError, reported } = recorder();
    const limit = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: false, retryAfterSeconds: 30 })
    );

    const result = await checkRateLimit({
      key: "user_alice",
      limiter: { limit },
      reportError,
    });

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(limit).toHaveBeenCalledWith("user_alice");
    expect(reported).toEqual([]);
  });

  it("allows and reports when the limiter throws", async () => {
    const { reportError, reported } = recorder();
    const outage = new Error("Upstash is down");

    const result = await checkRateLimit({
      key: "user_alice",
      limiter: { limit: () => Promise.reject(outage) },
      reportError,
    });

    expect(result).toEqual({ allowed: true });
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe(
      "Rate limiter failed, serving uncounted"
    );
    expect((reported[0] as Error).cause).toBe(outage);
  });

  it("allows and reports when the limiter takes over a second", async () => {
    vi.useFakeTimers();
    const { reportError, reported } = recorder();

    const pending = checkRateLimit({
      key: "user_alice",
      limiter: { limit: () => new Promise(() => undefined) },
      reportError,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(reported).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toEqual({ allowed: true });
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).cause).toEqual(
      new Error("Rate limiter timed out after 1000 ms")
    );
  });

  it("takes the timeout as a parameter", async () => {
    vi.useFakeTimers();
    const { reportError, reported } = recorder();

    const pending = checkRateLimit({
      key: "user_alice",
      limiter: { limit: () => new Promise(() => undefined) },
      reportError,
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(50);

    expect(await pending).toEqual({ allowed: true });
    expect((reported[0] as Error).cause).toEqual(
      new Error("Rate limiter timed out after 50 ms")
    );
  });
});
