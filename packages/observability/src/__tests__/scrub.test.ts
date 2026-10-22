import { describe, expect, it } from "vitest";
import { scrubEvent } from "../index";

describe("scrubEvent", () => {
  it("removes auth and cookie headers, cookies, the body and non-id user fields", () => {
    const event = {
      message: "boom",
      request: {
        cookies: { __session: "abc" },
        data: '{"email":"someone@example.com"}',
        headers: {
          Authorization: "Bearer secret",
          "content-type": "application/json",
          cookie: "__session=abc",
          "Proxy-Authorization": "Basic x",
          "Set-Cookie": "a=b",
        },
        method: "POST",
        url: "https://webhooks.fitmeproject.com/clerk",
      },
      user: {
        email: "someone@example.com",
        id: "user_123",
        ip_address: "1.2.3.4",
        username: "someone",
      },
    };

    expect(scrubEvent(event)).toEqual({
      message: "boom",
      request: {
        headers: { "content-type": "application/json" },
        method: "POST",
        url: "https://webhooks.fitmeproject.com/clerk",
      },
      user: { id: "user_123" },
    });
  });

  it("drops a user without an id", () => {
    const event = { user: { email: "someone@example.com" } };

    expect(scrubEvent(event)).toEqual({});
  });

  it("leaves an event without request or user as it is", () => {
    const event = { message: "boom" };

    expect(scrubEvent(event)).toEqual({ message: "boom" });
  });
});

describe("scrubEvent's query backstop", () => {
  const FAILED_QUERY =
    'Failed query: delete from "profiles" where "user_id" = $1\nparams: user_2DeleteMe';

  it("replaces every exception value of an event with a failed query", () => {
    const event = {
      exception: {
        values: [
          {
            type: "error",
            value: 'invalid input syntax for type uuid: "user_2DeleteMe"',
          },
          { type: "Error", value: FAILED_QUERY },
        ],
      },
    };

    expect(scrubEvent(event)).toEqual({
      exception: {
        values: [
          { type: "error", value: "Database query failed" },
          { type: "Error", value: "Database query failed" },
        ],
      },
    });
  });

  it("replaces a breadcrumb message with a failed query, and its data", () => {
    const event = {
      breadcrumbs: [
        { category: "console", message: "starting" },
        {
          category: "console",
          data: { arguments: [FAILED_QUERY], logger: "console" },
          level: "error",
          message: `Error: ${FAILED_QUERY}`,
        },
        { category: "console", message: `cleanup Error: ${FAILED_QUERY}` },
      ],
    };

    expect(scrubEvent(event)).toEqual({
      breadcrumbs: [
        { category: "console", message: "starting" },
        {
          category: "console",
          level: "error",
          message: "Database query failed",
        },
        { category: "console", message: "Database query failed" },
      ],
    });
  });

  it("leaves other exceptions and breadcrumbs as they are", () => {
    const event = {
      breadcrumbs: [{ message: "Fetched: /health" }],
      exception: { values: [{ type: "Error", value: "boom" }] },
    };

    expect(scrubEvent(event)).toEqual(event);
  });
});
