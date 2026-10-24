import {
  checkRateLimit,
  LIMITER_TIMEOUT_MS,
  type RateLimit,
  type RateLimiter,
  rateLimiterFromEnv as sharedRateLimiterFromEnv,
} from "@fitme/rate-limit";
import type { z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import type { ApiEnv, Caller } from "./auth.js";
import type { ErrorResponse } from "./schemas.js";

export type { RateLimiter } from "@fitme/rate-limit";

/** Requests a User may make per window by default: plenty for any app, too few to hammer the API. */
export const DEFAULT_REQUESTS_PER_WINDOW = 300;
export const DEFAULT_WINDOW_SECONDS = 60;

const MS_PER_SECOND = 1000;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

const positiveInteger = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
) => {
  const value = env[name]?.trim();
  if (!value) {
    return fallback;
  }
  if (!POSITIVE_INTEGER.test(value)) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  return Number(value);
};

/**
 * The per-User limit: `RATE_LIMIT_REQUESTS` per `RATE_LIMIT_WINDOW_SECONDS`
 * (300 a minute unset). A malformed value throws, so a deployment with one
 * fails at startup instead of serving with a limit nobody chose.
 */
export const rateLimitFromEnv = (
  env: Record<string, string | undefined>
): RateLimit => ({
  limit: positiveInteger(
    env,
    "RATE_LIMIT_REQUESTS",
    DEFAULT_REQUESTS_PER_WINDOW
  ),
  windowMs:
    positiveInteger(env, "RATE_LIMIT_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS) *
    MS_PER_SECOND,
});

/**
 * Upstash when configured; otherwise in memory outside production (a Vercel
 * preview included), and a throw in production, so a production deployment
 * without Upstash fails at startup (see `@fitme/rate-limit`).
 */
export const rateLimiterFromEnv = (
  env: Record<string, string | undefined>
): RateLimiter =>
  sharedRateLimiterFromEnv(env, { ...rateLimitFromEnv(env), prefix: "api" });

/**
 * The bucket a caller's requests are counted in. A session is the User
 * themselves; a later credential kind (an OAuth client, an API key) gets a
 * bucket of its own here, without touching the User's.
 */
const bucketKey = (caller: Caller) => `user:${caller.userId}`;

const tooManyRequests = {
  error: {
    code: "rate_limited",
    message: "Too many requests, retry after the Retry-After header's seconds",
  },
} satisfies z.infer<typeof ErrorResponse>;

/**
 * Counts every request with a verified caller (after `requireCaller`) before
 * anything is served; over the limit answers 429 `rate_limited` with
 * `Retry-After`. A limiter that throws or takes over `timeoutMs` serves the
 * request uncounted (fail open) and reports the failure.
 */
export const rateLimitCallers = ({
  limiter,
  reportError,
  timeoutMs = LIMITER_TIMEOUT_MS,
}: {
  limiter: RateLimiter;
  reportError: (error: unknown) => Promise<void>;
  timeoutMs?: number;
}) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    const result = await checkRateLimit({
      key: bucketKey(c.var.caller),
      limiter,
      reportError,
      timeoutMs,
    });
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json(tooManyRequests, 429);
    }
    await next();
  });
