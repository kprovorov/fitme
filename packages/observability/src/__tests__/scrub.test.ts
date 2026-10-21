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
