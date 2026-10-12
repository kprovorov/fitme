import { assertEquals } from "jsr:@std/assert@^1";
import { Webhook } from "npm:standardwebhooks@^1";
import { type ClerkWebhookDeps, createClerkWebhookHandler } from "./handler.ts";

// A Standard Webhooks secret: "whsec_" + base64 of random bytes
const SIGNING_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const USER_ID = "user_2DeleteMe00000000000000";

function userDeleted(id: string | undefined = USER_ID) {
  return {
    data: { deleted: true, id, object: "user" },
    instance_id: "ins_123",
    object: "event",
    timestamp: Date.now(),
    type: "user.deleted",
  };
}

// Signs like Clerk (Svix): svix-id, svix-timestamp, svix-signature headers
function signedRequest(
  event: unknown,
  { secret = SIGNING_SECRET, messageId = "msg_1" } = {}
): Request {
  const body = JSON.stringify(event);
  const timestamp = new Date();
  const signature = new Webhook(secret).sign(messageId, timestamp, body);
  return new Request("http://localhost/clerk-webhook", {
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": messageId,
      "svix-signature": signature,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    },
    method: "POST",
  });
}

function setup(overrides: Partial<ClerkWebhookDeps> = {}) {
  const deleted: string[] = [];
  const reported: unknown[] = [];
  const handler = createClerkWebhookHandler({
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
  });
  return { deleted, handler, reported };
}

Deno.test("an unsigned request is rejected and deletes nothing", async () => {
  const { deleted, handler } = setup();

  const response = await handler(
    new Request("http://localhost/clerk-webhook", {
      body: JSON.stringify(userDeleted()),
      method: "POST",
    })
  );

  assertEquals(response.status, 401);
  assertEquals(deleted, []);
});

Deno.test("a signed user.deleted event deletes the User's data", async () => {
  const { deleted, handler } = setup();

  const response = await handler(signedRequest(userDeleted()));

  assertEquals(response.status, 200);
  assertEquals(deleted, [USER_ID]);
});

Deno.test("an event signed with another secret is rejected", async () => {
  const { deleted, handler } = setup();

  const response = await handler(
    signedRequest(userDeleted(), {
      secret: "whsec_c2lnbmVkIGJ5IHNvbWVvbmUgZWxzZQ==",
    })
  );

  assertEquals(response.status, 401);
  assertEquals(deleted, []);
});

Deno.test("a replayed user.deleted event is accepted again", async () => {
  const { deleted, handler } = setup();

  await handler(signedRequest(userDeleted()));
  const response = await handler(signedRequest(userDeleted()));

  // delete_user_data is idempotent, so a second call is harmless
  assertEquals(response.status, 200);
  assertEquals(deleted, [USER_ID, USER_ID]);
});

Deno.test("other events are acknowledged and delete nothing", async () => {
  const { deleted, handler } = setup();

  const response = await handler(
    signedRequest({ ...userDeleted(), type: "user.updated" })
  );

  assertEquals(response.status, 200);
  assertEquals(deleted, []);
});

Deno.test("a failed cleanup is reported and answers 500 so Clerk retries", async () => {
  const failure = new Error("database unreachable");
  const { handler, reported } = setup({
    deleteUserData: () => Promise.reject(failure),
  });

  const response = await handler(signedRequest(userDeleted()));

  assertEquals(response.status, 500);
  assertEquals(reported, [failure]);
});
