import type { RouteHandlerArgs } from "eve/channels";
import { none } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { beforeEach, describe, expect, it } from "vitest";
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

const imagePart = (mediaType: string, bytes = 1024) => ({
  data: `data:${mediaType};base64,${base64Image(bytes)}`,
  filename: "attachment",
  mediaType,
  type: "file",
});

let sent: unknown[] = [];

const sendMessage = async (message: unknown) => {
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
  const args = {
    attachSession: () => ({
      send: (payload: unknown) => {
        sent.push(payload);
        return Promise.resolve({
          deliveryId: "del_1",
          sessionId: SESSION_ID,
          status: "accepted" as const,
        });
      },
    }),
    params: { sessionId: SESSION_ID },
  } as unknown as RouteHandlerArgs;
  return await sessionMessageRoute.handler(request, args);
};

beforeEach(() => {
  sent = [];
});

describe("Arnold's eve channel", () => {
  it("declares the Attachment upload policy", () => {
    expect(
      (arnoldChannel as { adapter?: { uploadPolicy?: unknown } }).adapter
        ?.uploadPolicy
    ).toEqual({
      allowedMediaTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: MAX_BYTES,
    });
  });
});

describe("a message with Attachments", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "takes a small %s image",
    async (mediaType) => {
      const part = imagePart(mediaType);

      const response = await sendMessage([
        { text: "What is this machine?", type: "text" },
        part,
      ]);

      expect(response.status).toBe(202);
      expect(sent).toEqual([
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
    expect(await response.json()).toMatchObject({
      ok: false,
      violations: [{ kind: "too-large", limit: MAX_BYTES }],
    });
    expect(sent).toEqual([]);
  });

  it.each(["application/pdf", "image/heic", "image/gif", "text/plain"])(
    "refuses a %s file with 415",
    async (mediaType) => {
      const response = await sendMessage([imagePart(mediaType)]);

      expect(response.status).toBe(415);
      expect(await response.json()).toMatchObject({
        ok: false,
        violations: [
          {
            allowedMediaTypes: ["image/jpeg", "image/png", "image/webp"],
            kind: "disallowed-media-type",
            mediaType,
          },
        ],
      });
      expect(sent).toEqual([]);
    }
  );
});

describe("a message without Attachments", () => {
  it("takes a text message as before", async () => {
    const response = await sendMessage("Show me my plan");

    expect(response.status).toBe(202);
    expect(sent).toEqual(["Show me my plan"]);
  });

  it("takes a text part as before", async () => {
    const response = await sendMessage([
      { text: "Show me my plan", type: "text" },
    ]);

    expect(response.status).toBe(202);
    expect(sent).toEqual([[{ text: "Show me my plan", type: "text" }]]);
  });
});
