import type { FilePart, UserContent } from "ai";
import type { RouteHandlerArgs } from "eve/channels";
import { none } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import arnoldChannel from "../agent/channels/eve";
import { attachmentUploadPolicy } from "../agent/lib/upload-policy";

const SESSION_ID = "wrun_alice";
const MAX_BYTES = 3 * 1024 * 1024;

// The real policy on a channel of our own, so the request runs through eve's
// own route handler without Clerk, RevenueCat or a database.
const channel = eveChannel({
  // eve's own anonymous authenticator: this file is about the upload policy,
  // not auth, which clerk-auth.test.ts and reset-auth.test.ts cover.
  auth: [none()],
  uploadPolicy: attachmentUploadPolicy,
});

const sessionMessageRoute = channel.routes.find(
  (route) =>
    route.transport === "http" &&
    route.method === "POST" &&
    route.path === "/eve/v1/session/:sessionId"
);

/** Base64 of `bytes` zero bytes; a multiple of 3 encodes to exactly that many. */
const base64Image = (bytes: number) => Buffer.alloc(bytes).toString("base64");

const imagePart = (mediaType: string, bytes = 1024): FilePart => ({
  data: `data:${mediaType};base64,${base64Image(bytes)}`,
  filename: "attachment",
  mediaType,
  type: "file",
});

let sent: (string | UserContent)[] = [];

const unexpectedOperation = (): never => {
  throw new Error("the upload-policy test does not support this operation");
};

const sendMessage = async (message: string | UserContent) => {
  if (sessionMessageRoute?.transport !== "http") {
    throw new Error("the eve channel has no session-message route");
  }

  const request = new Request(
    `http://arnold.test/eve/v1/session/${SESSION_ID}`,
    {
      body: JSON.stringify({ message }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );

  const args: RouteHandlerArgs = {
    attachSession: () => ({
      cancel: unexpectedOperation,
      clear: unexpectedOperation,
      compact: unexpectedOperation,
      getEventStream: unexpectedOperation,
      getStreamTailIndex: unexpectedOperation,
      id: SESSION_ID,
      prewarm: unexpectedOperation,
      reset: unexpectedOperation,
      respond: unexpectedOperation,
      send: async (payload) => {
        sent.push(payload);

        return await Promise.resolve({
          deliveryId: "del_1",
          sessionId: SESSION_ID,
          status: "accepted" as const,
        });
      },
    }),
    describe: unexpectedOperation,
    from: unexpectedOperation,
    invokeTool: unexpectedOperation,
    listSkillFiles: unexpectedOperation,
    params: { sessionId: SESSION_ID },
    readSkill: unexpectedOperation,
    requestIp: null,
    resolveSession: unexpectedOperation,
    to: unexpectedOperation,
    waitUntil: unexpectedOperation,
  };

  return await sessionMessageRoute.handler(request, args);
};

describe("arnold's eve channel", () => {
  it("declares the Attachment upload policy", () => {
    const { adapter } = z
      .object({ adapter: z.object({ uploadPolicy: z.unknown() }) })
      .parse(arnoldChannel);

    expect(adapter.uploadPolicy).toStrictEqual({
      allowedMediaTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: MAX_BYTES,
    });
  });
});

describe("a message with Attachments", () => {
  beforeEach(() => {
    sent = [];
  });

  it.each(["image/jpeg", "image/png", "image/webp"])(
    "takes a small %s image",
    async (mediaType) => {
      const part = imagePart(mediaType);

      const response = await sendMessage([
        { text: "What is this machine?", type: "text" },
        part,
      ]);

      expect(response.status).toBe(202);
      expect(sent).toStrictEqual([
        [
          { text: "What is this machine?", type: "text" },
          { data: part.data, filename: "attachment", mediaType, type: "file" },
        ],
      ]);
    }
  );

  it("takes an image of exactly 3 MiB", async () => {
    const response = await sendMessage([imagePart("image/jpeg", MAX_BYTES)]);

    expect(response.status).toBe(202);
  });

  it("refuses an image over 3 MiB with 413", async () => {
    const response = await sendMessage([
      imagePart("image/jpeg", MAX_BYTES + 3),
    ]);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      violations: [{ kind: "too-large", limit: MAX_BYTES }],
    });
    expect(sent).toStrictEqual([]);
  });

  it.each(["application/pdf", "image/heic", "image/gif", "text/plain"])(
    "refuses a %s file with 415",
    async (mediaType) => {
      const response = await sendMessage([imagePart(mediaType)]);

      expect(response.status).toBe(415);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        violations: [
          {
            allowedMediaTypes: ["image/jpeg", "image/png", "image/webp"],
            kind: "disallowed-media-type",
            mediaType,
          },
        ],
      });
      expect(sent).toStrictEqual([]);
    }
  );
});

describe("a message without Attachments", () => {
  beforeEach(() => {
    sent = [];
  });

  it("takes a text message as before", async () => {
    const response = await sendMessage("Show me my plan");

    expect(response.status).toBe(202);
    expect(sent).toStrictEqual(["Show me my plan"]);
  });

  it("takes a text part as before", async () => {
    const response = await sendMessage([
      { text: "Show me my plan", type: "text" },
    ]);

    expect(response.status).toBe(202);
    expect(sent).toStrictEqual([[{ text: "Show me my plan", type: "text" }]]);
  });
});
