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
import {
  createStreamChecker,
  emptySessionView,
  foldEvents,
  openInteractions,
} from "eve/events";

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

  it("holds a call for approval, then runs it once approved", async () => {
    fakeArnold.holdNextToolCallForApproval(
      {
        input: { plan_name: "Push A" },
        name: "propose_plan",
        output: { saved: true },
      },
      { prompt: "Save Push A?" }
    );

    const { delivery, session } = await client().sessions.create({
      message: "Save a plan called Push A.",
    });

    const held = await delivery.result();

    expect(held.outcome).toBe("awaiting-input");
    expect(held.interactions).toHaveLength(1);

    const { events: paused } = await session.snapshot();

    // Requested, never started: the turn paused on the approval.
    expect(paused.map((event) => event.type)).toEqual([
      "session.started",
      "delivery.admitted",
      "turn.started",
      "delivery.consumed",
      "model.requested",
      "model.started",
      "call.requested",
      "model.settled",
      "interaction.opened",
      "turn.paused",
      "delivery.settled",
    ]);
    expect(paused.map((event) => event.type)).not.toContain("call.started");

    const [interaction] = held.interactions;
    const interactionId = interaction?.interactionId ?? "";

    expect(
      paused.find((event) => event.type === "interaction.opened")?.data
    ).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({
          kind: "approval",
          options: [
            { id: "approve", label: "Approve" },
            { id: "deny", label: "Deny" },
          ],
          prompt: "Save Push A?",
        }),
      })
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);

    const approved = await session.respond(
      [{ interactionId, optionId: "approve" }],
      { clientContext: { language: "en" } }
    );

    await expect(approved.result()).resolves.toEqual(
      expect.objectContaining({ outcome: "handled", status: "completed" })
    );
    expect(fakeArnold.responses).toEqual([
      {
        answers: [{ interactionId, optionId: "approve" }],
        clientContext: { language: "en" },
        sessionId: session.state.sessionId,
      },
    ]);

    const { events } = await session.snapshot();
    const after = events.slice(paused.length);

    expect(after.map((event) => event.type)).toEqual([
      "delivery.admitted",
      "response.submitted",
      "response.admitted",
      "response.settled",
      "interaction.settled",
      "delivery.consumed",
      "call.started",
      "call.settled",
      "model.requested",
      "model.started",
      "content.delta",
      "content.completed",
      "model.settled",
      "turn.settled",
      "delivery.settled",
    ]);
    expect(after.find((event) => event.type === "call.started")?.data).toEqual(
      expect.objectContaining({ clearedBy: { interactionId } })
    );
    expect(after.find((event) => event.type === "call.settled")?.data).toEqual(
      expect.objectContaining({ outcome: "completed", output: { saved: true } })
    );
    // The answer continues the paused turn: no second turn starts.
    expect(after.map((event) => event.type)).not.toContain("turn.started");
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("fails an approved call with the test's error", async () => {
    fakeArnold.holdNextToolCallForApproval({
      error: "The Plan changed",
      name: "propose_plan",
    });

    const { delivery, session } = await client().sessions.create({
      message: "Save it",
    });

    const { interactions } = await delivery.result();
    const interactionId = interactions[0]?.interactionId ?? "";

    const approved = await session.respond([
      { interactionId, optionId: "approve" },
    ]);

    await approved.result();

    const { events } = await session.snapshot();

    expect(events.find((event) => event.type === "call.settled")?.data).toEqual(
      expect.objectContaining({ outcome: "failed" })
    );
    expect(
      events.find((event) => event.type === "content.completed")?.data
    ).toEqual(expect.objectContaining({ value: FAKE_ARNOLD_REPLY }));
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("never runs a denied call, and goes on to the answer", async () => {
    fakeArnold.holdNextToolCallForApproval({
      name: "propose_plan",
      output: { saved: true },
    });

    const { delivery, session } = await client().sessions.create({
      message: "Save it",
    });

    const { interactions } = await delivery.result();
    const interactionId = interactions[0]?.interactionId ?? "";

    const denied = await session.respond([
      { interactionId, optionId: "deny", text: "Make it 12 reps." },
    ]);

    await expect(denied.result()).resolves.toEqual(
      expect.objectContaining({ outcome: "handled" })
    );
    expect(fakeArnold.responses.map((response) => response.answers)).toEqual([
      [{ interactionId, optionId: "deny", text: "Make it 12 reps." }],
    ]);

    const { events } = await session.snapshot();

    expect(events.map((event) => event.type)).not.toContain("call.started");
    expect(
      events.find((event) => event.type === "interaction.settled")?.data
    ).toEqual(
      expect.objectContaining({
        outcome: "declined",
        response: { optionId: "deny", text: "Make it 12 reps." },
      })
    );
    expect(events.find((event) => event.type === "call.settled")?.data).toEqual(
      expect.objectContaining({
        cause: { interactionId },
        error: {
          code: "TOOL_EXECUTION_DENIED",
          message:
            'Tool execution was denied. The person who denied it wrote: "Make it 12 reps."',
        },
        outcome: "rejected",
      })
    );
    expect(
      events.find((event) => event.type === "content.completed")?.data
    ).toEqual(expect.objectContaining({ value: FAKE_ARNOLD_REPLY }));
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("withdraws a waiting call when a message arrives, and answers it", async () => {
    fakeArnold.holdNextToolCallForApproval({
      name: "propose_plan",
      output: { saved: true },
    });

    const { delivery, session } = await client().sessions.create({
      message: "Save it",
    });

    await delivery.result();

    const message = await session.send("Which muscles does a bench work?");

    await expect(message.result()).resolves.toEqual(
      expect.objectContaining({ outcome: "handled", status: "completed" })
    );
    expect(fakeArnold.responses).toEqual([]);
    expect(fakeArnold.sent.map((sent) => sent.text)).toEqual([
      "Save it",
      "Which muscles does a bench work?",
    ]);

    const { events } = await session.snapshot();

    expect(events.map((event) => event.type)).not.toContain("call.started");
    expect(
      events.find((event) => event.type === "interaction.settled")?.data
    ).toEqual(
      expect.objectContaining({
        outcome: "withdrawn",
        reason: "superseded-by-message",
      })
    );
    expect(events.find((event) => event.type === "call.settled")?.data).toEqual(
      expect.objectContaining({ outcome: "rejected" })
    );
    // The message is consumed by the paused turn, which answers it.
    expect(
      events.flatMap((event) =>
        event.type === "delivery.consumed" ? [event.data.turnId] : []
      )
    ).toEqual(["turn_0", "turn_0"]);
    expect(
      events.filter((event) => event.type === "turn.started")
    ).toHaveLength(1);
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("reads a typed option as the answer, as eve does", async () => {
    fakeArnold.holdNextToolCallForApproval({
      name: "propose_plan",
      output: { saved: true },
    });

    const { delivery, session } = await client().sessions.create({
      message: "Save it",
    });

    await delivery.result();

    const typed = await session.send("Approve");
    await typed.result();

    const { events } = await session.snapshot();

    expect(
      events.find((event) => event.type === "interaction.settled")?.data
    ).toEqual(expect.objectContaining({ outcome: "accepted" }));
    expect(
      events.find((event) => event.type === "response.submitted")?.data
    ).toEqual(
      expect.objectContaining({
        responseId: expect.stringMatching(/_typed_0$/u),
      })
    );
    expect(events.map((event) => event.type)).toContain("call.started");
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("starts an empty turn for an answer to a settled approval", async () => {
    fakeArnold.holdNextToolCallForApproval({
      name: "propose_plan",
      output: { saved: true },
    });

    const { delivery, session } = await client().sessions.create({
      message: "Save it",
    });

    const { interactions } = await delivery.result();

    const answer = [
      {
        interactionId: interactions[0]?.interactionId ?? "",
        optionId: "approve",
      },
    ];

    const approved = await session.respond(answer);
    await approved.result();
    const stale = await session.respond(answer);
    await stale.result();

    const { events } = await session.snapshot();

    // The call ran once; the stale answer opened a second turn.
    expect(
      events.filter((event) => event.type === "call.started")
    ).toHaveLength(1);
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

  it("refuses an answer that doesn't settle the waiting call", async () => {
    fakeArnold.holdNextToolCallForApproval({
      name: "propose_plan",
      output: { saved: true },
    });

    const { delivery, session } = await client().sessions.create({
      message: "Save it",
    });

    await delivery.result();

    await expect(
      session.respond([{ interactionId: "int_other", optionId: "approve" }])
    ).rejects.toBeInstanceOf(ClientError);

    const { events } = await session.snapshot();

    expect(events.map((event) => event.type)).not.toContain(
      "interaction.settled"
    );
    await expect(violations(session.state.sessionId)).resolves.toEqual([]);
  });

  it("shows a reader that follows again the call still waiting", async () => {
    fakeArnold.holdNextToolCallForApproval({
      name: "propose_plan",
      output: { saved: true },
    });
    const first = await client().sessions.create({ message: "Save it" });
    const { interactions } = await first.delivery.result();
    const interactionId = interactions[0]?.interactionId ?? "";

    // A second client, as a reopened screen, attached by the id alone.
    const reopened = client().sessions.attach(first.session.state.sessionId, {
      streamIndex: 0,
    });

    const { events: before } = await reopened.snapshot();

    expect(
      openInteractions(foldEvents(emptySessionView(), before)).map(
        (open) => open.interactionId
      )
    ).toEqual([interactionId]);

    const approved = await reopened.respond([
      { interactionId, optionId: "approve" },
    ]);

    await approved.result();

    const { events } = await reopened.snapshot();

    expect(
      events.filter((event) => event.type === "call.started")
    ).toHaveLength(1);
    await expect(violations(first.session.state.sessionId)).resolves.toEqual(
      []
    );
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
