import { beforeEach, describe, expect, it } from "@jest/globals";
/**
 * The fake Arnold through eve 1.0's own client, as `@assistant-ui/eve`
 * reaches it on the Arnold screen: it creates a session, records every part a
 * send carried (a file part's data included) and streams the turn back in
 * stream version 27, echoing a sent file as metadata only, the way eve's
 * `delivery.consumed` does. eve's own stream checker reads every line, so the
 * fake can't drift from the protocol the real server speaks.
 */
import { Client, ClientError } from "eve/client";
import type { StoredLine } from "eve/events";
import { createStreamChecker } from "eve/events";

import { FAKE_ARNOLD_REPLY, fakeArnold } from "~/test-utils/fake-arnold";

/** A JPEG's first bytes, as the app sends a re-encoded Attachment. */
const IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/** The bytes `IMAGE` carries, which the echo reports as its `size`. */
const IMAGE_BYTES = 10;

const NOT_ARNOLD = /not Arnold/u;

const client = () => new Client({ baseUrl: fakeArnold.baseUrl });

/** The session's stored lines, read off its stream route as eve serves them. */
const storedLines = async (sessionId: string): Promise<StoredLine[]> => {
  const answer = await fakeArnold.fetch(
    `${fakeArnold.baseUrl}/eve/v1/session/${sessionId}/stream?follow=false`
  );

  const body = await new Response(answer.body).text();

  return body
    .split("\n")
    .filter((line) => line !== "")
    .map((line): unknown => JSON.parse(line))
    .filter(
      (line): line is StoredLine =>
        typeof line === "object" &&
        line !== null &&
        ("facts" in line || "progress" in line)
    );
};

/** What eve's own checker finds wrong with the session's stream. */
const violations = async (sessionId: string) => {
  const checker = createStreamChecker();

  const lines = await storedLines(sessionId);

  return lines.flatMap((line, position) =>
    checker.check(line, position).map((violation) => violation.message)
  );
};

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
      "delivery.admitted",
      "turn.started",
      "delivery.consumed",
      "model.requested",
      "model.started",
      "content.delta",
      "content.completed",
      "model.settled",
      "turn.settled",
      "delivery.settled",
    ]);
    // Positions count lines: a commit's facts share one, and a progress
    // record has its own.
    expect(events.map((event) => event.meta.position)).toEqual([
      { index: 0, line: 0 },
      { index: 1, line: 0 },
      { index: 0, line: 1 },
      { index: 1, line: 1 },
      { index: 0, line: 2 },
      { index: 1, line: 2 },
      { index: 0, line: 3 },
      { index: 0, line: 4 },
      { index: 1, line: 4 },
      { index: 0, line: 5 },
      { index: 1, line: 5 },
    ]);

    const consumed = events.find((event) => event.type === "delivery.consumed");

    // The echo carries a file's metadata only, under `kind`: never its bytes
    // or a URL.
    expect(consumed?.data).toEqual({
      deliveryId: expect.any(String),
      parts: [
        { kind: "text", text: "What is this?" },
        {
          filename: "gym.jpg",
          kind: "file",
          mediaType: "image/jpeg",
          size: IMAGE_BYTES,
        },
      ],
      turnId: "turn_0",
    });

    const completed = events.find(
      (event) => event.type === "content.completed"
    );

    expect(completed?.data).toEqual(
      expect.objectContaining({
        kind: "text",
        phase: "reply",
        value: FAKE_ARNOLD_REPLY,
      })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("answers a send's delivery once its turn has settled", async () => {
    const { session } = await client().sessions.create({});
    const delivery = await session.send("Hi");

    await expect(delivery.result()).resolves.toEqual(
      expect.objectContaining({ status: "completed" })
    );
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

    // Each turn follows the one before it, as eve chains a Conversation.
    expect(
      events.flatMap((event) =>
        event.type === "turn.started"
          ? [{ follows: event.data.follows, turnId: event.data.turnId }]
          : []
      )
    ).toEqual([
      { follows: null, turnId: "turn_0" },
      { follows: "turn_0", turnId: "turn_1" },
    ]);
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("calls tools before it answers, when a test asks it to", async () => {
    fakeArnold.callToolsNextTurn([
      { input: { a: 1 }, name: "first_tool", output: { success: true } },
      { error: "It broke", name: "second_tool" },
    ]);
    const { session } = await client().sessions.create({ message: "Hi" });
    const { events } = await session.snapshot();

    expect(
      events.flatMap((event) =>
        event.type === "call.settled"
          ? [{ outcome: event.data.outcome, output: event.data.output }]
          : []
      )
    ).toEqual([
      { outcome: "completed", output: { success: true } },
      { outcome: "failed", output: undefined },
    ]);
    expect(
      events.find((event) => event.type === "content.completed")?.data
    ).toEqual(expect.objectContaining({ value: FAKE_ARNOLD_REPLY }));
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("fails a turn after echoing its message", async () => {
    fakeArnold.failNextTurn();
    const { session } = await client().sessions.create({ message: "Hi" });
    const { events } = await session.snapshot();
    const settled = events.find((event) => event.type === "turn.settled");

    expect(events.map((event) => event.type)).toContain("delivery.consumed");
    expect(settled?.data).toEqual(
      expect.objectContaining({ outcome: "failed" })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("holds a turn on a running tool call until the test releases it", async () => {
    const release = fakeArnold.holdNextToolCall(
      { input: { a: 1 }, name: "get_active_plan", output: { success: true } },
      { narration: "Reading your plan." }
    );

    const { session } = await client().sessions.create({});
    const delivery = await session.send("Hi");
    const held = await session.snapshot();

    // Requested and started, not settled, and the turn still open.
    expect(held.events.map((event) => event.type)).toEqual([
      "session.started",
      "delivery.admitted",
      "turn.started",
      "delivery.consumed",
      "model.requested",
      "model.started",
      "content.delta",
      "content.completed",
      "call.requested",
      "model.settled",
      "call.started",
    ]);
    expect(
      held.events.find((event) => event.type === "content.completed")?.data
    ).toEqual(
      expect.objectContaining({
        phase: "narration",
        value: "Reading your plan.",
      })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);

    release();

    await expect(delivery.result()).resolves.toEqual(
      expect.objectContaining({ status: "completed" })
    );

    const { events } = await session.snapshot();

    expect(events.slice(held.events.length).map((event) => event.type)).toEqual(
      [
        "call.settled",
        "model.requested",
        "model.started",
        "content.delta",
        "content.completed",
        "model.settled",
        "turn.settled",
        "delivery.settled",
      ]
    );
    expect(events.find((event) => event.type === "call.settled")?.data).toEqual(
      expect.objectContaining({
        outcome: "completed",
        output: { success: true },
      })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("runs a held turn through when it was released before it started", async () => {
    fakeArnold.holdNextToolCall({ name: "get_plans", output: [] })();
    const { session } = await client().sessions.create({});
    const delivery = await session.send("Hi");

    await expect(delivery.result()).resolves.toEqual(
      expect.objectContaining({ status: "completed" })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("cancels a held turn as eve does, keeping what it streamed", async () => {
    const release = fakeArnold.holdNextToolCall(
      { name: "get_active_plan", output: { success: true } },
      { narration: "Reading your plan." }
    );

    const { session } = await client().sessions.create({});
    const delivery = await session.send("Hi");
    const held = await session.snapshot();
    const cancel = await session.cancel();

    await expect(cancel.result()).resolves.toEqual(
      expect.objectContaining({ status: "completed" })
    );
    await expect(delivery.result()).resolves.toEqual(
      expect.objectContaining({ status: "cancelled" })
    );

    const { events } = await session.snapshot();
    const after = events.slice(held.events.length);

    expect(after.map((event) => event.type)).toEqual([
      "delivery.admitted",
      "call.settled",
      "turn.settled",
      "delivery.settled",
      "delivery.settled",
    ]);
    expect(after.map((event) => event.data)).toEqual([
      expect.objectContaining({
        deliveryId: cancel.deliveryId,
        source: { control: "cancel" },
      }),
      expect.objectContaining({
        outcome: "interrupted",
        reason: "turn-cancelled",
      }),
      expect.objectContaining({
        cause: { deliveryId: cancel.deliveryId },
        outcome: "cancelled",
        turnId: "turn_0",
      }),
      expect.objectContaining({ outcome: "handled", turnId: "turn_0" }),
      { deliveryId: cancel.deliveryId, outcome: "applied" },
    ]);
    // The narration streamed before the cancel stays.
    expect(
      events.find((event) => event.type === "content.completed")?.data
    ).toEqual(expect.objectContaining({ value: "Reading your plan." }));
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);

    // A release after the cancel writes nothing more for that turn.
    release();

    const later = await session.snapshot();

    expect(later.events).toHaveLength(events.length);
  });

  it("ignores a cancel guarded for another turn", async () => {
    const release = fakeArnold.holdNextToolCall({
      name: "get_active_plan",
      output: { success: true },
    });

    const { session } = await client().sessions.create({});
    const delivery = await session.send("Hi");

    await session.snapshot();

    const cancel = await session.cancel({ turnId: "turn_other" });
    const { events } = await session.snapshot();

    expect(
      events.find(
        (event) =>
          event.type === "delivery.settled" &&
          event.data.deliveryId === cancel.deliveryId
      )?.data
    ).toEqual(expect.objectContaining({ outcome: "ignored" }));
    expect(events.map((event) => event.type)).not.toContain("turn.settled");

    release();

    await expect(delivery.result()).resolves.toEqual(
      expect.objectContaining({ status: "completed" })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("answers the next turn normally after a cancelled one", async () => {
    fakeArnold.holdNextToolCall({ name: "get_plans", output: [] });
    const { session } = await client().sessions.create({});
    await session.send("Hi");
    await session.snapshot();
    const cancel = await session.cancel();
    await cancel.result();

    const next = await session.send("Again");

    await expect(next.result()).resolves.toEqual(
      expect.objectContaining({ status: "completed" })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("records a cancel with no running turn as ignored", async () => {
    const { session } = await client().sessions.create({ message: "Hi" });
    const delivery = await session.cancel();
    const { events } = await session.snapshot();

    expect(
      events.find(
        (event) =>
          event.type === "delivery.settled" &&
          event.data.deliveryId === delivery.deliveryId
      )?.data
    ).toEqual(expect.objectContaining({ outcome: "ignored" }));
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
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

  it("ends a session, then refuses it", async () => {
    const { session } = await client().sessions.create({ message: "Hi" });
    const ended = await session.end();

    expect(ended.sessionId).toBe(session.state.sessionId);

    const refused = await session
      .send("Again")
      .catch((error: unknown) => error);

    expect((refused as ClientError).code).toBe("session_not_active");
  });

  it("answers a stranded session as eve does, which the client won't retry", async () => {
    fakeArnold.strandSession("ses_from_0_81");
    const session = client().sessions.attach("ses_from_0_81");

    const events = session.stream()[Symbol.asyncIterator]();
    const followed = await events.next().catch((error: unknown) => error);

    expect((followed as ClientError).status).toBe(409);
    expect((followed as ClientError).code).toBe("session_stranded");

    const refused = await session.send("Hi").catch((error: unknown) => error);

    expect((refused as ClientError).code).toBe("session_stranded");
    expect(fakeArnold.sent).toEqual([]);
  });

  it("stops serving a stream whose reader dropped it", async () => {
    const { session } = await client().sessions.create({});

    const answer = await fakeArnold.fetch(
      `${fakeArnold.baseUrl}/eve/v1/session/${session.state.sessionId}/stream`
    );

    // eve's own reader drops the stream at a turn boundary, leaving the
    // session's later lines with nobody to serve them.
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

    const refused = await inFlight;

    expect(refused.status).toBe(409);
    expect(fakeArnold.sent).toEqual([]);
    expect(fakeArnold.sessionIds).toEqual([]);
  });

  it("fails the test when a request reaches another host", async () => {
    await expect(
      fakeArnold.fetch("http://example.test/eve/v1/health")
    ).rejects.toThrow(NOT_ARNOLD);
  });
});
