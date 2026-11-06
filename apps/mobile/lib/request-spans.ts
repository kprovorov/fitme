import { tracePropagationTargets } from "@fitme/observability";
import type { TransactionEvent } from "@sentry/react-native";
import { z } from "zod";

/**
 * Whether Sentry should record an `http.client` span for `url`: every host we
 * send trace headers to, and only those. Keeping the two sets equal is what
 * makes a span and its request share a trace — the SDK gives a propagated
 * request without a span a `sentry-trace` for a trace that never existed.
 * Clerk, RevenueCat, Supabase and Segment are on neither list, so they get no
 * span and no header.
 */
export const isTracedRequestUrl = (url: string): boolean =>
  tracePropagationTargets.some((target) => target.test(url));

/** The op Sentry gives an outgoing HTTP request. */
const HTTP_CLIENT_OP = "http.client";

/** A path segment that is a row id, as every `/v1` route takes one. */
const ROW_ID =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;

/**
 * The Library's `GET /exercises/<slug>`: the one variable segment that isn't a
 * row id. `workout-session-exercises/…` has no slash before `exercises`, so
 * the Public API's routes never match.
 */
const EXERCISE_SLUG = /\/exercises\/[^/?#\s]+/gu;

/** Arnold's `/eve/v1/session/<id>…`, whose eve session id is no uuid. */
const EVE_SESSION = /\/session\/[^/?#\s]+/gu;

/** The span attributes that carry the request URL, query string and all. */
const URL_ATTRIBUTES = new Set(["http.url", "url", "url.full"]);
const urlAttributeSchema = z.string();

/**
 * The attributes that are only a query string or a fragment: dropped whole,
 * since the Library's `?search=` is what the User typed.
 */
const QUERY_ATTRIBUTES = new Set([
  "http.fragment",
  "http.query",
  "url.fragment",
  "url.query",
]);

/** The route a URL belongs to: its row ids, slugs and session ids templated. */
const templated = (url: string): string =>
  url
    .replaceAll(ROW_ID, "/{id}")
    .replaceAll(EXERCISE_SLUG, "/exercises/{slug}")
    .replaceAll(EVE_SESSION, "/session/{id}");

/** Everything after the path: a query string, a fragment, or both. */
const QUERY_AND_FRAGMENT = /[?#].*$/u;

/** The parts of a transaction event this module reads. */
export interface SpannedEvent {
  spans?: {
    data?: NonNullable<TransactionEvent["spans"]>[number]["data"];
    description?: string;
    op?: string;
  }[];
}

type RequestSpan = NonNullable<SpannedEvent["spans"]>[number];

const templateRequestSpan = (span: RequestSpan) => {
  const data = Object.fromEntries(
    Object.entries(span.data ?? {}).flatMap(([name, value]) => {
      if (QUERY_ATTRIBUTES.has(name)) {
        return [];
      }

      const url = URL_ATTRIBUTES.has(name)
        ? urlAttributeSchema.safeParse(value)
        : undefined;

      return [
        [
          name,
          url?.success
            ? templated(url.data.replace(QUERY_AND_FRAGMENT, ""))
            : value,
        ],
      ];
    })
  );

  return {
    ...span,
    data,
    ...(span.description && { description: templated(span.description) }),
  };
};

/**
 * `beforeSendTransaction`, before `scrubEvent`: every `http.client` span is
 * named after its route (`/v1/plans/{id}`), not the row it asked for, so
 * Sentry groups a route's requests together and p50/p95 per route can be read
 * off `span.description`. Query strings and fragments are dropped from the
 * span, since the Library's `?search=` is what the User typed. Returns a copy;
 * a transaction with no spans comes back as it was.
 */
export const templateRequestSpans = <T extends SpannedEvent>(event: T): T =>
  event.spans
    ? {
        ...event,
        spans: event.spans.map((span) =>
          span.op === HTTP_CLIENT_OP ? templateRequestSpan(span) : span
        ),
      }
    : event;
