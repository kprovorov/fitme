import { proEntitlement } from "@fitme/core";
import { z } from "zod";

/** How long an answer is reused: a lapsed or new subscription takes effect within it. */
export const PRO_CHECK_TTL_MS = 5 * 60 * 1000;

// How long RevenueCat gets to answer before the check fails (closed), so a
// stalled request can't hold the channel open.
const REVENUECAT_TIMEOUT_MS = 5000;

// A bound on the cache so a long-lived instance can't grow it without limit.
const MAX_CACHED_USERS = 10_000;

const REVENUECAT_SUBSCRIBERS_URL = "https://api.revenuecat.com/v1/subscribers";

const isoTimestampOrNull = z.string().datetime({ offset: true }).nullish();

const subscriberResponse = z.object({
  subscriber: z.object({
    entitlements: z.record(
      z.object({
        expires_date: isoTimestampOrNull,
        grace_period_expires_date: isoTimestampOrNull,
      })
    ),
  }),
});

export type ProCheck = (userId: string) => Promise<boolean>;

interface ProCheckOptions {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  /** RevenueCat's secret API key; defaults to `REVENUECAT_SECRET_KEY`. */
  secretKey?: () => string | undefined;
  timeoutMs?: number;
}

/**
 * Until when the entitlement is active: `Infinity` for a lifetime one, `null`
 * when the User doesn't have it. A billing grace period keeps it active, as
 * it does in the app.
 */
const proUntil = (
  body: z.infer<typeof subscriberResponse>,
  now: number
): number | null => {
  const entitlement = body.subscriber.entitlements[proEntitlement];
  if (!entitlement) {
    return null;
  }
  if (entitlement.expires_date === null) {
    return Number.POSITIVE_INFINITY;
  }
  const until = Math.max(
    Date.parse(entitlement.expires_date ?? "") || 0,
    Date.parse(entitlement.grace_period_expires_date ?? "") || 0
  );
  return until > now ? until : null;
};

/**
 * Whether a User has Pro, asked of RevenueCat's REST API by the User id the
 * app identifies to RevenueCat (their Clerk id). Each answer is reused for
 * `PRO_CHECK_TTL_MS` (a Pro one no longer than the entitlement lasts). A
 * failure, a request over `timeoutMs` (5 s), or a missing key, throws and
 * isn't cached: callers fail closed.
 */
export const createProCheck = ({
  fetch = globalThis.fetch,
  now = Date.now,
  secretKey = () => process.env.REVENUECAT_SECRET_KEY,
  timeoutMs = REVENUECAT_TIMEOUT_MS,
}: ProCheckOptions = {}): ProCheck => {
  const cache = new Map<string, { expiresAt: number; isPro: boolean }>();

  return async (userId) => {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now()) {
      return cached.isPro;
    }
    const key = secretKey();
    if (!key) {
      throw new Error("Missing REVENUECAT_SECRET_KEY environment variable");
    }
    const response = await fetch(
      `${REVENUECAT_SUBSCRIBERS_URL}/${encodeURIComponent(userId)}`,
      {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    if (!response.ok) {
      throw new Error(`RevenueCat answered ${response.status}`);
    }
    const body = subscriberResponse.parse(await response.json());
    const checkedAt = now();
    const until = proUntil(body, checkedAt);
    if (cache.size >= MAX_CACHED_USERS) {
      cache.clear();
    }
    cache.set(userId, {
      expiresAt: Math.min(
        checkedAt + PRO_CHECK_TTL_MS,
        until ?? Number.POSITIVE_INFINITY
      ),
      isPro: until !== null,
    });
    return until !== null;
  };
};
