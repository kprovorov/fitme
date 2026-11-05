import { beforeEach, describe, expect, it } from "@jest/globals";
/**
 * The fake Arnold through eve's own client, as `@assistant-ui/eve` reaches it
 * on the Arnold screen: it creates a session, records every part a send
 * carried (a file part's data included) and streams the turn back, echoing a
 * sent file as metadata only, the way eve's `message.received` does.
 */
import { Client, ClientError } from "eve/client";
import { it, describe, expect, beforeEach } from "vitest";

import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";

/** A JPEG's first bytes, as the app sends a re-encoded Attachment. */
const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/** The bytes `IMAGE` carries, which the echo reports as its `size`. */
const IMAGE_BYTES = 10;

const NOT_ARNOLD = /not Arnold/;

const client = () => new Client({ host: fakeArnold.baseUrl });

beforeEach(() => {
  fakeArnold.install();
});

describe("fake Arnold", () => {
  it("records a sent message's parts and streams the turn back", async () => {
    const { session } = await client().sessions.create({});
    await session.send([
      { text: "What is this?", type: "text" },
      {
        data: IMAGE,
        filename: "gym.jpg",
        mediaType: "image/jpeg",
        type: "file",
      },
    ]);

    expect(fakeArnold.sent).toEqual([
      {
        parts: [
          { text: "What is this?", type: "text" },
          {
            data: IMAGE,
            filename: "gym.jpg",
            mediaType: "image/jpeg",
            type: "file",
          },
        ],
        sessionId: session.state.sessionId,
        text: "What is this?",
      },
    ]);

    const { events } = await session.snapshot();
    expect(events.map((event) => event.type)).toEqual([
      "session.started",
      "turn.started",
      "message.received",
      "message.appended",
      "message.completed",
      "turn.completed",
      "session.waiting",
    ]);
    const received = events.find((event) => event.type === "message.received");
    // The echo carries a file's metadata only: never its bytes or a URL.
    expect(received?.data).toEqual({
      message: "What is this?",
      parts: [
        { text: "What is this?", type: "text" },
        {
          filename: "gym.jpg",
          mediaType: "image/jpeg",
          size: IMAGE_BYTES,
          type: "file",
        },
      ],
      sequence: 1,
      turnId: "turn_0",
    });

    const completed = events.find(
      (event) => event.type === "message.completed"
    );

    expect(completed?.data.message).toBe(FAKE_ARNOLD_REPLY);
  });

  it("keeps later turns in the same session", async () => {
    const { session } = await client().sessions.create({ message: "First" });
    await session.send("Second");

    expect(fakeArnold.sent.map((message) => message.text)).toEqual([
      "First",
      "Second",
    ]);
    expect(fakeArnold.sessionIds).toEqual([session.state.sessionId]);
    const { events } = await session.snapshot();
    expect(
      events.filter((event) => event.type === "turn.started")
    ).toHaveLength(2);
  });

  it("refuses a send on demand and never creates the session", async () => {
    fakeArnold.failNextSend("pro-required");

    const refused = await client()
      .sessions.create({ message: "Hi" })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ClientError);
    expect((refused as ClientError).status).toBe(403);
    expect((refused as ClientError).code).toBe("arnold_pro_required");
    expect(fakeArnold.sessionIds).toEqual([]);
    expect(fakeArnold.sent).toEqual([]);
  });

  it("fails a send that never reaches Arnold", async () => {
    const { session } = await client().sessions.create({});
    fakeArnold.failNextSend("network");

    await expect(session.send("Hi")).rejects.toThrow("Network request failed");
  });

  it("answers a reset, then refuses the retired session", async () => {
    const { session } = await client().sessions.create({ message: "Hi" });

    await expect(session.reset()).resolves.toEqual({
      previousSessionId: session.state.sessionId,
      status: "reset",
    });
    const refused = await session
      .send("Again")
      .catch((error: unknown) => error);
    expect((refused as ClientError).code).toBe("session_not_active");
  });

  it("stops serving a stream whose reader dropped it", async () => {
    const { session } = await client().sessions.create({});

    const answer = await fakeArnold.fetch(
      `${fakeArnold.baseUrl}/eve/v1/session/${session.state.sessionId}/stream`
    );

    // eve's own reader drops the stream at a turn boundary, leaving the
    // session's later events with nobody to serve them.
    await (answer.body as ReadableStream<Uint8Array>).cancel();

    // Serving a dropped stream throws into the turn eve is running, so this
    // send must go through untouched.
    await session.send("Hi");

    expect(fakeArnold.sent).toHaveLength(1);
  });

  it("records nothing from a request still in flight when it is reset", async () => {
    const inFlight = fakeArnold.fetch(`${fakeArnold.baseUrl}/eve/v1/session`, {
      body: JSON.stringify({ message: "From the test before" }),
      method: "POST",
    });

    // What `after-each.ts` does while that request is still on its way.
    fakeArnold.reset();

    expect((await inFlight).status).toBe(409);
    expect(fakeArnold.sent).toEqual([]);
    expect(fakeArnold.sessionIds).toEqual([]);
  });

  it("fails the test when a request reaches another host", async () => {
    await expect(
      fakeArnold.fetch("http://example.test/eve/v1/health")
    ).rejects.toThrow(NOT_ARNOLD);
  });
});
