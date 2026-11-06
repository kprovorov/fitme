import { reportError } from "@fitme/observability/node";
import { defaultStackParser, NodeClient, withScope } from "@sentry/node";
import type { Event } from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";
import { Webhook } from "standardwebhooks";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  arnoldResetConfig,
  arnoldSessionResetter,
  deleteArnoldConversations,
} from "../arnold.js";
import { createApp } from "../create-app.js";
import type { AppDeps } from "../create-app.js";

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
  event: ReturnType<typeof userDeleted>,
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

const setup = (overrides: Partial<AppDeps["clerk"]> = {}) => {
  const deleted: string[] = [];
  const reported: unknown[] = [];
  // Every cleanup step, in the order it ran
  const steps: string[] = [];

  const app = createApp({
    clerk: {
      deleteArnoldConversations: (userId) => {
        steps.push(`conversations:${userId}`);

        return Promise.resolve();
      },
      deleteUserData: (userId) => {
        deleted.push(userId);
        steps.push(`data:${userId}`);

        return Promise.resolve();
      },
      signingSecret: SIGNING_SECRET,
      ...overrides,
    },
    reportError: (error) => {
      reported.push(error);

      return Promise.resolve();
    },
  });

  return { app, deleted, reported, steps };
};

/** Captures the route's rejection log so expected rejections print nothing. */
const spyOnRejectionLog = () =>
  vi.spyOn(console, "warn").mockReturnValue(undefined);

const restoreMocks = () => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
};

/** The real cleanup over `env`, with two recorded sessions and Arnold faked. */
const setupFromEnv = (env: Record<string, string | undefined>) => {
  const requests: Request[] = [];

  const fetch: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const sessionId = request.url.split("/").at(-2);

    return Promise.resolve(
      Response.json({
        ok: true,
        previousSessionId: sessionId,
        status: "reset",
      })
    );
  };

  const reported: unknown[] = [];

  const app = createApp({
    clerk: {
      deleteArnoldConversations: deleteArnoldConversations({
        listSessionIds: () => Promise.resolve(["wrun_a", "wrun_b"]),
        resetSession: arnoldSessionResetter({
          ...arnoldResetConfig(env),
          fetch,
        }),
      }),
      deleteUserData: () => Promise.resolve(),
      signingSecret: SIGNING_SECRET,
    },
    reportError: (error) => {
      reported.push(error);

      return Promise.resolve();
    },
  });

  return { app, reported, requests };
};

describe("pOST /clerk", () => {
  afterEach(restoreMocks);

  it("rejects an unsigned request without deleting anything", async () => {
    const { app, deleted } = setup();
    const warn = spyOnRejectionLog();

    const response = await app.request(CLERK_URL, {
      body: JSON.stringify(userDeleted()),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(deleted).toStrictEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "Rejected Clerk webhook",
      expect.any(Error)
    );
  });

  it("deletes the User's data on a signed user.deleted event", async () => {
    const { app, deleted } = setup();

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(200);
    expect(deleted).toStrictEqual([USER_ID]);
  });

  it("wipes the User's Arnold Conversations after their data", async () => {
    const { app, steps } = setup();

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(200);
    expect(steps).toStrictEqual([
      `data:${USER_ID}`,
      `conversations:${USER_ID}`,
    ]);
  });

  it("leaves the Conversations alone when the data deletion fails", async () => {
    const { app, steps } = setup({
      deleteUserData: () => Promise.reject(new Error("database unreachable")),
    });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    expect(steps).toStrictEqual([]);
  });

  it("reports a failed Conversation wipe and answers 500 so Clerk retries", async () => {
    const failure = new Error("Arnold unreachable");

    const { app, reported } = setup({
      deleteArnoldConversations: () => Promise.reject(failure),
    });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "cleanup_failed", message: "User data cleanup failed" },
    });
    expect(reported).toStrictEqual([failure]);
  });

  it("rejects an event signed with another secret", async () => {
    const { app, deleted } = setup();
    const warn = spyOnRejectionLog();

    const response = await app.request(
      signedRequest(userDeleted(), { secret: OTHER_SECRET })
    );

    expect(response.status).toBe(401);
    expect(deleted).toStrictEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "Rejected Clerk webhook",
      expect.any(Error)
    );
  });

  it("rejects a tampered body", async () => {
    const { app, deleted } = setup();
    const warn = spyOnRejectionLog();
    const signed = signedRequest(userDeleted("user_someoneElse"));

    const response = await app.request(CLERK_URL, {
      body: JSON.stringify(userDeleted()),
      headers: signed.headers,
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(deleted).toStrictEqual([]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      "Rejected Clerk webhook",
      expect.any(Error)
    );
  });

  it("reports a failed cleanup once and answers 500 so Clerk retries", async () => {
    const failure = new Error("database unreachable");

    const { app, reported } = setup({
      deleteUserData: () => Promise.reject(failure),
    });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "cleanup_failed", message: "User data cleanup failed" },
    });
    expect(reported).toStrictEqual([failure]);
  });

  it("reports a failed deletion query without the deleted User's id", async () => {
    const log = vi.spyOn(console, "error").mockReturnValue(undefined);

    const failure = new DrizzleQueryError(
      'delete from "profiles" where "user_id" = $1',
      [USER_ID],
      Object.assign(new Error("canceling statement due to lock timeout"), {
        code: "55P03",
      })
    );

    // Exercise the real reporter and Sentry client without network delivery.
    const captured: { error: unknown; tags: Event["tags"] }[] = [];

    const client = new NodeClient({
      beforeSend: (event, hint) => {
        captured.push({ error: hint.originalException, tags: event.tags });

        return event;
      },
      dsn: "https://public@sentry.test/1",
      integrations: [],
      stackParser: defaultStackParser,
      transport: () => ({
        flush: () => Promise.resolve(true),
        send: () => Promise.resolve({}),
      }),
    });

    client.init();

    const app = createApp({
      clerk: {
        deleteArnoldConversations: () => Promise.resolve(),
        deleteUserData: () => Promise.reject(failure),
        signingSecret: SIGNING_SECRET,
      },
      reportError,
    });

    const response = await withScope(async (scope) => {
      scope.setClient(client);

      try {
        return await app.request(signedRequest(userDeleted()));
      } finally {
        await client.close();
      }
    });

    expect(response.status).toBe(500);
    expect(captured).toHaveLength(1);
    const sent = captured[0]?.error;

    if (!(sent instanceof Error)) {
      throw new TypeError("Expected a captured Error");
    }

    for (const leak of [USER_ID, "delete from", "lock timeout"]) {
      expect(sent.stack).not.toContain(leak);
    }

    expect({
      cause: sent.cause,
      message: sent.message,
      tags: captured[0]?.tags,
    }).toStrictEqual({
      cause: undefined,
      message: "Database query failed (SQLSTATE 55P03)",
      tags: { sqlstate: "55P03" },
    });
    expect(log.mock.calls.flat()).toStrictEqual([sent]);
  });

  it("acknowledges other events without deleting anything", async () => {
    const { app, steps } = setup();

    const response = await app.request(
      signedRequest({ ...userDeleted(), type: "user.updated" })
    );

    expect(response.status).toBe(200);
    expect(steps).toStrictEqual([]);
  });

  it("accepts a replayed user.deleted event again", async () => {
    const { app, deleted, steps } = setup();

    await app.request(signedRequest(userDeleted()));
    const response = await app.request(signedRequest(userDeleted()));

    // Both steps are idempotent, so there is no svix-id dedupe
    expect(response.status).toBe(200);
    expect(deleted).toStrictEqual([USER_ID, USER_ID]);
    expect(
      steps.filter((step) => step.startsWith("conversations:"))
    ).toStrictEqual([`conversations:${USER_ID}`, `conversations:${USER_ID}`]);
  });
});

describe("pOST /clerk without a signing secret", () => {
  afterEach(restoreMocks);

  it("reports the misconfiguration and answers 500 so Clerk retries", async () => {
    const { app, deleted, reported } = setup({ signingSecret: undefined });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    expect(deleted).toStrictEqual([]);
    expect(reported).toHaveLength(1);
  });
});

describe("pOST /clerk resetting Arnold sessions from the environment", () => {
  afterEach(restoreMocks);

  const ARNOLD_URL = "https://arnold.test";
  const RESET_SECRET = "reset-secret-0123456789abcdef0123456789abcdef";

  it("resets each recorded session with ARNOLD_URL and ARNOLD_RESET_SECRET", async () => {
    const { app, requests } = setupFromEnv({
      ARNOLD_RESET_SECRET: RESET_SECRET,
      ARNOLD_URL,
    });

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(200);
    expect(requests.map((request) => request.url)).toStrictEqual([
      `${ARNOLD_URL}/eve/v1/session/wrun_a/reset`,
      `${ARNOLD_URL}/eve/v1/session/wrun_b/reset`,
    ]);

    expect(
      requests.map((request) => request.headers.get("authorization"))
    ).toStrictEqual([`Bearer ${RESET_SECRET}`, `Bearer ${RESET_SECRET}`]);
  });

  it.each([
    ["neither set", {}],
    [
      "only the pre-rename COACH_URL and COACH_RESET_SECRET set",
      { COACH_RESET_SECRET: RESET_SECRET, COACH_URL: ARNOLD_URL },
    ],
  ])("reports and answers 500 with %s", async (_, env) => {
    const { app, reported, requests } = setupFromEnv(env);

    const response = await app.request(signedRequest(userDeleted()));

    expect(response.status).toBe(500);
    expect(reported).toHaveLength(1);
    expect(requests).toStrictEqual([]);
  });
});
