import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { waitUntil } from "@vercel/functions";

/** Longer than this, the limiter counts as down and the request is served uncounted. */
export const LIMITER_TIMEOUT_MS = 1000;

const MS_PER_SECOND = 1000;

/** How many requests one bucket may make per fixed window. */
export interface RateLimit {
  limit: number;
  windowMs: number;
}

/** One counted request: whether it may be served, and if not, when to retry. */
export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Counts requests per bucket key (the caller picks it: a User id today, a
 * credential later); throws (or never settles) when its store is down.
 */
export interface RateLimiter {
  limit: (key: string) => Promise<RateLimitResult>;
}

/** Whole seconds until `resetAt`, at least 1, for `Retry-After`. */
const secondsUntil = (resetAt: number, now: number) =>
  Math.max(1, Math.ceil((resetAt - now) / MS_PER_SECOND));

/**
 * A fixed window per key, kept in this instance's memory: for local
 * development and tests, where each instance counting alone doesn't matter.
 */
export const memoryRateLimiter = ({
  limit,
  now = Date.now,
  windowMs,
}: RateLimit & { now?: () => number }): RateLimiter => {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    limit: (key) => {
      const time = now();
      let window = windows.get(key);
      if (!window || time >= window.resetAt) {
        window = { count: 0, resetAt: time + windowMs };
        windows.set(key, window);
      }
      window.count += 1;
      return Promise.resolve(
        window.count <= limit
          ? { allowed: true }
          : {
              allowed: false,
              retryAfterSeconds: secondsUntil(window.resetAt, time),
            }
      );
    },
  };
};

/** Where an Upstash limiter keeps its windows: the key prefix names the app and bucket. */
export interface UpstashOptions extends RateLimit {
  prefix: string;
}

/** A fixed window per key in Upstash Redis, shared by every instance. */
export const upstashRateLimiter = ({
  limit,
  prefix,
  token,
  url,
  windowMs,
}: UpstashOptions & { token: string; url: string }): RateLimiter => {
  const ratelimit = new Ratelimit({
    // Upstash's Rate Limit Analytics dashboard: who's counted, who's refused.
    analytics: true,
    limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
    prefix,
    redis: new Redis({
      // No retries: a slow Upstash would hold every request past our timeout.
      retry: false,
      // Each call gets its own signal, so a request served uncounted can't
      // still increment the window once Upstash answers.
      signal: () => AbortSignal.timeout(LIMITER_TIMEOUT_MS),
      token,
      url,
    }),
    // Fails would pass silently (`reason: "timeout"`); `checkRateLimit` times
    // out itself so an outage gets reported.
    timeout: 0,
  });
  return {
    limit: async (key) => {
      const { pending, reset, success } = await ratelimit.limit(key);
      // The analytics write, after the response: a serverless instance that
      // freezes once it's answered would drop it otherwise.
      waitUntil(
        pending.catch((error: unknown) => {
          console.warn("Rate limit analytics write failed", error);
        })
      );
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
 * Upstash when it's configured (`UPSTASH_REDIS_REST_URL`,
 * `UPSTASH_REDIS_REST_TOKEN`). Outside production without it, an in-memory
 * limiter; in production, missing configuration throws, so a misconfigured
 * deployment fails at startup instead of serving without limits.
 */
export const rateLimiterFromEnv = (
  env: Record<string, string | undefined>,
  options: UpstashOptions
): RateLimiter => {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return upstashRateLimiter({ ...options, token, url });
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
  }
  return memoryRateLimiter(options);
};

const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
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

/**
 * Counts one request in `key`'s bucket. A limiter that throws or takes over
 * `timeoutMs` allows the request (fail open) and reports the failure, so a
 * store outage never locks anyone out.
 */
export const checkRateLimit = async ({
  key,
  limiter,
  reportError,
  timeoutMs = LIMITER_TIMEOUT_MS,
}: {
  key: string;
  limiter: RateLimiter;
  reportError: (error: unknown) => Promise<void>;
  timeoutMs?: number;
}): Promise<RateLimitResult> => {
  try {
    return await withTimeout(limiter.limit(key), timeoutMs);
  } catch (error) {
    await reportError(
      new Error("Rate limiter failed, serving uncounted", { cause: error })
    );
    return { allowed: true };
  }
};
