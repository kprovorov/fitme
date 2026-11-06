import { afterEach, assert, describe, expect, it, vi } from "vitest";

import {
  checkRateLimit,
  memoryRateLimiter,
  rateLimiterFromEnv,
} from "../index";
import type { RateLimiter } from "../index";

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

const limitTimes = async (
  limiter: RateLimiter,
  key: string,
  times: number
): Promise<boolean[]> => {
  if (times <= 0) {
    return [];
  }

  const result = await limiter.limit(key);
  const remaining = await limitTimes(limiter, key, times - 1);

  return [result.allowed, ...remaining];
};

const recorder = () => {
  const reported: Error[] = [];

  const reportError: Parameters<
    typeof checkRateLimit
  >[0]["reportError"] = async (cause) => {
    assert.instanceOf(cause, Error);
    reported.push(cause);

    await Promise.resolve();
  };

  return { reportError, reported };
};

describe("memory rate limiter", () => {
  it("allows the limit within a window, then refuses with the seconds left", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(3), now: clock.now });

    const allowed = await limitTimes(limiter, "user_alice", 3);
    clock.advance(45_000);

    expect(allowed).toStrictEqual([true, true, true]);
    await expect(limiter.limit("user_alice")).resolves.toStrictEqual({
      allowed: false,
      retryAfterSeconds: 15,
    });
  });

  it("rounds Retry-After up, never below a second", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(1), now: clock.now });

    await limiter.limit("user_alice");
    clock.advance(MINUTE_MS - 1);

    await expect(limiter.limit("user_alice")).resolves.toStrictEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("starts a new window once the last one ends", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(2), now: clock.now });

    await limitTimes(limiter, "user_alice", 3);
    clock.advance(MINUTE_MS);

    await expect(limitTimes(limiter, "user_alice", 3)).resolves.toStrictEqual([
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

    await expect(limiter.limit("user_alice")).resolves.toStrictEqual({
      allowed: false,
      retryAfterSeconds: 6,
    });
    clock.advance(6000);
    await expect(limiter.limit("user_alice")).resolves.toStrictEqual({
      allowed: true,
    });
  });

  it("counts each key in its own bucket", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ ...perMinute(1), now: clock.now });

    await limitTimes(limiter, "user:user_alice", 2);

    await expect(limiter.limit("user:user_bob")).resolves.toStrictEqual({
      allowed: true,
    });
    await expect(limiter.limit("client:abc")).resolves.toStrictEqual({
      allowed: true,
    });
  });
});

describe("rate limiter from environment", () => {
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
    ).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
    expect(() =>
      rateLimiterFromEnv(
        { NODE_ENV: "production", UPSTASH_REDIS_REST_TOKEN: "token" },
        options
      )
    ).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
  });

  it("uses the in-memory limiter with the given limit outside production without Upstash", async () => {
    const limiter = rateLimiterFromEnv(
      { NODE_ENV: "development" },
      { ...perMinute(2), prefix: "test:user" }
    );

    await expect(limitTimes(limiter, "user_alice", 3)).resolves.toStrictEqual([
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

    await expect(limitTimes(limiter, "user_alice", 3)).resolves.toStrictEqual([
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

describe("rate limit checks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers the limiter's result for the key", async () => {
    const { reportError, reported } = recorder();

    const limit = vi.fn<RateLimiter["limit"]>(
      async () =>
        await Promise.resolve({
          allowed: false,
          retryAfterSeconds: 30,
        })
    );

    const result = await checkRateLimit({
      key: "user_alice",
      limiter: { limit },
      reportError,
    });

    expect(result).toStrictEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(limit).toHaveBeenCalledWith("user_alice");
    expect(reported).toStrictEqual([]);
  });

  it("allows and reports when the limiter throws", async () => {
    const { reportError, reported } = recorder();
    const outage = new Error("Upstash is down");

    const result = await checkRateLimit({
      key: "user_alice",
      limiter: {
        limit: async () => await Promise.reject(outage),
      },
      reportError,
    });

    expect(result).toStrictEqual({ allowed: true });
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toBe("Rate limiter failed, serving uncounted");
    expect(reported[0].cause).toBe(outage);
  });

  it("allows and reports when the limiter takes over a second", async () => {
    vi.useFakeTimers();
    const { reportError, reported } = recorder();

    const pending = checkRateLimit({
      key: "user_alice",
      limiter: { limit: async () => await Promise.race([]) },
      reportError,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(reported).toStrictEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toStrictEqual({ allowed: true });
    expect(reported).toHaveLength(1);
    expect(reported[0].cause).toStrictEqual(
      new Error("Rate limiter timed out after 1000 ms")
    );
  });

  it("takes the timeout as a parameter", async () => {
    vi.useFakeTimers();
    const { reportError, reported } = recorder();

    const pending = checkRateLimit({
      key: "user_alice",
      limiter: { limit: async () => await Promise.race([]) },
      reportError,
      timeoutMs: 50,
    });

    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toStrictEqual({ allowed: true });
    expect(reported[0].cause).toStrictEqual(
      new Error("Rate limiter timed out after 50 ms")
    );
  });
});
