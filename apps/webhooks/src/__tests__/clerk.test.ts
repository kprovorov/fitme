import { Webhook } from "standardwebhooks";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { ClerkWebhookDeps } from "../routes/clerk.js";

// A Standard Webhooks secret, as Clerk issues them: "whsec_" + base64
const SIGNING_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const OTHER_SECRET = "whsec_c2lnbmVkIGJ5IHNvbWVvbmUgZWxzZQ==";
const USER_ID = "user_2DeleteMe00000000000000";
const CLERK_URL = "http://localhost/clerk";

const userDeleted = (id = USER_ID) => ({
  data: { deleted: true, id, object: "user" },
  instance_id: "ins_123",
  object: "event",
  timestamp: Date.now(),
  type: "user.deleted",
});

/** Signs like Clerk (Svix): svix-id, svix-timestamp and svix-signature. */
const signedRequest = (
  event: unknown,
  { secret = SIGNING_SECRET, messageId = "msg_1" } = {}
): Request => {
  const body = JSON.stringify(event);
  const timestamp = new Date();
  return new Request(CLERK_URL, {
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": messageId,
      "svix-signature": new Webhook(secret).sign(messageId, timestamp, body),
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    },
    method: "POST",
  });
};

const setup = (overrides: Partial<ClerkWebhookDeps> = {}) => {
  const deleted: string[] = [];
  const reported: unknown[] = [];
  const app = createApp({
    clerk: {
      deleteUserData: (userId) => {
        deleted.push(userId);
        return Promise.resolve();
      },
      reportError: (error) => {
        reported.push(error);
        return Promise.resolve();
      },
      signingSecret: SIGNING_SECRET,
      ...overrides,
    },
  });
  return { app, deleted, reported };
};

describe("POST /clerk", () => {
  it("rejects an unsigned request without deleting anything", async () => {
    const { app, deleted } = setup();

    const response = await app.request(CLERK_URL, {
      body: JSON.stringify(userDeleted()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(deleted).toEqual([]);
  });

  it("deletes the User's data on a signed user.deleted event", async () => {
    const { app, deleted } = setup();

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(200);
    expect(deleted).toEqual([USER_ID]);
  });

  it("rejects an event signed with another secret", async () => {
    const { app, deleted } = setup();

    const response = await app.request(
      signedRequest(userDeleted(), { secret: OTHER_SECRET })
    );

    expect(response.status).toBe(401);
    expect(deleted).toEqual([]);
  });

  it("rejects a tampered body", async () => {
    const { app, deleted } = setup();
    const signed = signedRequest(userDeleted("user_someoneElse"));

    const response = await app.request(CLERK_URL, {
      body: JSON.stringify(userDeleted()),
      headers: signed.headers,
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(deleted).toEqual([]);
  });

  it("reports a failed cleanup once and answers 500 so Clerk retries", async () => {
    const failure = new Error("database unreachable");
    const { app, reported } = setup({
      deleteUserData: () => Promise.reject(failure),
    });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "cleanup_failed", message: "User data cleanup failed" },
    });
    expect(reported).toEqual([failure]);
  });

  it("acknowledges other events without deleting anything", async () => {
    const { app, deleted } = setup();

    const response = await app.request(
      signedRequest({ ...userDeleted(), type: "user.updated" })
    );

    expect(response.status).toBe(200);
    expect(deleted).toEqual([]);
  });

  it("accepts a replayed user.deleted event again", async () => {
    const { app, deleted } = setup();

    await app.request(signedRequest(userDeleted()));
    const response = await app.request(signedRequest(userDeleted()));

    // deleteUserData is idempotent, so there is no svix-id dedupe
    expect(response.status).toBe(200);
    expect(deleted).toEqual([USER_ID, USER_ID]);
  });
});

describe("POST /clerk without a signing secret", () => {
  it("reports the misconfiguration and answers 500 so Clerk retries", async () => {
    const { app, deleted, reported } = setup({ signingSecret: undefined });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    expect(deleted).toEqual([]);
    expect(reported).toHaveLength(1);
  });
});
