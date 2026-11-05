import { describe, expect, it } from "@jest/globals";
import { describe, expect, it } from "vitest";

import { isTracedRequestUrl, templateRequestSpans } from "../request-spans";
import type { SpannedEvent } from "../request-spans";

describe(isTracedRequestUrl, () => {
  it("records a span for every service we send trace headers to", () => {
    for (const url of [
      "https://api.fitmeproject.com/v1/plans/active",
      "https://library.fitmeproject.com/exercises?limit=20",
      "https://arnold.fitmeproject.com/eve/v1/session",
    ]) {
      expect(isTracedRequestUrl(url)).toBe(true);
    }
  });

  it("records none for a third party, which gets no trace header either", () => {
    for (const url of [
      "https://clerk.fitmeproject.com/v1/client",
      "https://api.revenuecat.com/v1/subscribers/user_1",
      "https://abcdefgh.supabase.co/rest/v1/plans",
      "https://api.segment.io/v1/batch",
      "https://api.fitmeproject.com.evil.example/v1/plans",
    ]) {
      expect(isTracedRequestUrl(url)).toBe(false);
    }
  });
});

const requestSpan = (description: string, data: Record<string, unknown>) => ({
  data,
  description,
  op: "http.client",
});

describe(templateRequestSpans, () => {
  it("replaces a row id with its route template, so a route groups as one", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan(
          "GET https://api.fitmeproject.com/v1/plans/0b5a4d3c-1e2f-4a5b-8c7d-9e0f1a2b3c4d",
          {}
        ),
      ],
    }).spans;

    expect(span.description).toBe(
      "GET https://api.fitmeproject.com/v1/plans/{id}"
    );
  });

  it("replaces an Exercise slug with its route template", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan(
          "GET https://library.fitmeproject.com/exercises/barbell-back-squat",
          {}
        ),
      ],
    }).spans;

    expect(span.description).toBe(
      "GET https://library.fitmeproject.com/exercises/{slug}"
    );
  });

  it("leaves a route without a variable segment alone", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan("GET https://api.fitmeproject.com/v1/workout-sessions", {}),
      ],
    }).spans;

    expect(span.description).toBe(
      "GET https://api.fitmeproject.com/v1/workout-sessions"
    );
  });

  it("keeps the collection route of a nested write apart from a row", () => {
    const [added, logged] = templateRequestSpans({
      spans: [
        requestSpan(
          "POST https://api.fitmeproject.com/v1/workout-sessions/0b5a4d3c-1e2f-4a5b-8c7d-9e0f1a2b3c4d/exercises",
          {}
        ),
        requestSpan(
          "POST https://api.fitmeproject.com/v1/workout-session-exercises/0b5a4d3c-1e2f-4a5b-8c7d-9e0f1a2b3c4d/sets",
          {}
        ),
      ],
    }).spans;

    expect(added.description).toBe(
      "POST https://api.fitmeproject.com/v1/workout-sessions/{id}/exercises"
    );
    expect(logged.description).toBe(
      "POST https://api.fitmeproject.com/v1/workout-session-exercises/{id}/sets"
    );
  });

  it("drops the query string, which can carry what the User typed", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan("GET https://library.fitmeproject.com/exercises", {
          "http.fragment": "#top",
          "http.method": "GET",
          "http.query": "?search=bench%20press&limit=20",
          "http.url":
            "https://library.fitmeproject.com/exercises?search=bench%20press",
          url: "https://library.fitmeproject.com/exercises?search=bench%20press",
          "url.full":
            "https://library.fitmeproject.com/exercises?search=bench%20press",
        }),
      ],
    }).spans;

    expect(JSON.stringify(span.data)).not.toContain("search");
    expect(span.data["http.method"]).toBe("GET");
    expect(span.data.url).toBe("https://library.fitmeproject.com/exercises");
    expect(span.data["url.full"]).toBe(
      "https://library.fitmeproject.com/exercises"
    );
  });

  it("templates the URL it keeps on the span too", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan(
          "GET https://api.fitmeproject.com/v1/plans/0b5a4d3c-1e2f-4a5b-8c7d-9e0f1a2b3c4d",
          {
            "url.full":
              "https://api.fitmeproject.com/v1/plans/0b5a4d3c-1e2f-4a5b-8c7d-9e0f1a2b3c4d",
          }
        ),
      ],
    }).spans;

    expect(span.data["url.full"]).toBe(
      "https://api.fitmeproject.com/v1/plans/{id}"
    );
  });

  it("leaves every other span untouched", () => {
    const navigation = {
      data: { foo: "bar" },
      description: "/plans/[planId]",
      op: "navigation",
    };

    const event = { spans: [navigation] };
    expect(templateRequestSpans(event).spans[0]).toEqual(navigation);
  });

  it("answers an event with no spans as it came", () => {
    const event: SpannedEvent & { transaction: string } = {
      transaction: "/history",
    };

    expect(templateRequestSpans(event)).toEqual(event);
  });
});

describe("templateRequestSpans, Arnold", () => {
  it("replaces an eve session id with its route template", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan(
          "POST https://arnold.fitmeproject.com/eve/v1/session/wrun_01ARYZ6S41TSV4RRFFQ69G5FAV/messages",
          {}
        ),
      ],
    }).spans;

    expect(span.description).toBe(
      "POST https://arnold.fitmeproject.com/eve/v1/session/{id}/messages"
    );
  });

  it("leaves the route that creates a session alone", () => {
    const [span] = templateRequestSpans({
      spans: [
        requestSpan("POST https://arnold.fitmeproject.com/eve/v1/session", {}),
      ],
    }).spans;

    expect(span.description).toBe(
      "POST https://arnold.fitmeproject.com/eve/v1/session"
    );
  });
});
