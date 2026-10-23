import {
  checkRateLimit,
  LIMITER_TIMEOUT_MS,
  type RateLimiter,
  memoryRateLimiter as sharedMemoryRateLimiter,
  rateLimiterFromEnv as sharedRateLimiterFromEnv,
} from "@fitme/rate-limit";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import type { AuthEnv } from "./auth";
import type { ErrorResponse } from "./schemas";

export type { RateLimiter, RateLimitResult } from "@fitme/rate-limit";

/** Requests a User may make per window: enough for any app use, too few to scrape. */
export const USER_REQUESTS_PER_WINDOW = 120;
export const WINDOW_MS = 60_000;

const userLimit = {
  limit: USER_REQUESTS_PER_WINDOW,
  prefix: "exercises:user",
  windowMs: WINDOW_MS,
};

/** The per-User limit in this instance's memory, for local development and tests. */
export const memoryRateLimiter = ({
  now,
}: {
  now?: () => number;
} = {}): RateLimiter => sharedMemoryRateLimiter({ ...userLimit, now });

/** The per-User limit on Upstash; throws in production without it (see `@fitme/rate-limit`). */
export const rateLimiterFromEnv = (env: NodeJS.ProcessEnv): RateLimiter =>
  sharedRateLimiterFromEnv(env, userLimit);

const tooManyRequests = {
  error: {
    code: "rate_limited",
    message: "Too many requests, retry after the Retry-After header's seconds",
  },
} satisfies z.infer<typeof ErrorResponse>;

/**
 * Counts every User request (after `requireCaller`) before anything is
 * served, in the User's bucket (their Clerk id); over the limit answers 429
 * with `Retry-After`. Server callers aren't counted. A limiter that fails or
 * times out serves the request uncounted (fail open) and reports the failure.
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
    const result = await checkRateLimit({
      key: caller.userId,
      limiter,
      reportError,
      timeoutMs,
    });
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(tooManyRequests, 429);
    }
    return next();
  });
