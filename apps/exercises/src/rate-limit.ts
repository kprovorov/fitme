import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import type { AuthEnv } from "./auth";
import type { ErrorResponse } from "./schemas";

/** Requests a User may make per window: enough for any app use, too few to scrape. */
export const USER_REQUESTS_PER_WINDOW = 120;
export const WINDOW_MS = 60_000;

/** Longer than this, the limiter counts as down and the request is served uncounted. */
const LIMITER_TIMEOUT_MS = 1000;

const MS_PER_SECOND = 1000;

/** One counted request: whether it may be served, and if not, when to retry. */
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Counts a User's requests; throws (or never settles) when its store is down. */
export interface RateLimiter {
  limit: (userId: string) => Promise<RateLimitResult>;
}

/** Whole seconds until `resetAt`, at least 1, for `Retry-After`. */
const secondsUntil = (resetAt: number, now: number) =>
  Math.max(1, Math.ceil((resetAt - now) / MS_PER_SECOND));

/**
 * A fixed window per User, kept in this instance's memory: for local
 * development and tests, where each instance counting alone doesn't matter.
 */
export const memoryRateLimiter = ({
  now = Date.now,
}: {
  now?: () => number;
} = {}): RateLimiter => {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    limit: (userId) => {
      const time = now();
      let window = windows.get(userId);
      if (!window || time >= window.resetAt) {
        window = { count: 0, resetAt: time + WINDOW_MS };
        windows.set(userId, window);
      }
      window.count += 1;
      return Promise.resolve(
        window.count <= USER_REQUESTS_PER_WINDOW
          ? { allowed: true }
          : {
              allowed: false,
              retryAfterSeconds: secondsUntil(window.resetAt, time),
            }
      );
    },
  };
};

/** A fixed window per User in Upstash Redis, shared by every instance. */
export const upstashRateLimiter = ({
  token,
  url,
}: {
  token: string;
  url: string;
}): RateLimiter => {
  const ratelimit = new Ratelimit({
    limiter: Ratelimit.fixedWindow(USER_REQUESTS_PER_WINDOW, `${WINDOW_MS} ms`),
    prefix: "exercises:user",
    // No retries: a slow Upstash would hold every request past our timeout.
    redis: new Redis({ retry: false, token, url }),
    // Fails would pass silently (`reason: "timeout"`); the middleware times
    // out itself so an outage gets reported.
    timeout: 0,
  });
  return {
    limit: async (userId) => {
      const { reset, success } = await ratelimit.limit(userId);
      return success
        ? { allowed: true }
        : {
            allowed: false,
            retryAfterSeconds: secondsUntil(reset, Date.now()),
          };
    },
  };
};

/**
 * Upstash when it's configured. Outside production without it, an in-memory
 * limiter; in production, missing configuration throws, so a misconfigured
 * deployment fails at startup instead of serving without limits.
 */
export const rateLimiterFromEnv = (env: NodeJS.ProcessEnv): RateLimiter => {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return upstashRateLimiter({ token, url });
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
  }
  return memoryRateLimiter();
};

const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Rate limiter timed out after ${ms} ms`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const tooManyRequests = {
  error: {
    code: "rate_limited",
    message: "Too many requests, retry after the Retry-After header's seconds",
  },
} satisfies z.infer<typeof ErrorResponse>;

/**
 * Counts every User request (after `requireCaller`) before anything is
 * served; over the limit answers 429 with `Retry-After`. Server callers aren't
 * counted. A limiter that fails or times out serves the request uncounted
 * (fail open) and reports the failure.
 */
export const rateLimitUsers = ({
  limiter,
  reportError,
  timeoutMs = LIMITER_TIMEOUT_MS,
}: {
  limiter: RateLimiter;
  reportError: (error: unknown) => Promise<void>;
  timeoutMs?: number;
}) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const caller = c.get("caller");
    if (caller.type !== "user") {
      return next();
    }
    let result: RateLimitResult;
    try {
      result = await withTimeout(limiter.limit(caller.userId), timeoutMs);
    } catch (error) {
      await reportError(
        new Error("Rate limiter failed, serving uncounted", { cause: error })
      );
      return next();
    }
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(tooManyRequests, 429);
    }
    return next();
  });
