/**
 * A fetch-level stand-in for `apps/arnold`, answering eve's session routes
 * (`/eve/v1/session…`) the way `fake-public-api.ts` answers `/v1`, so the
 * Arnold screen runs on the real `@assistant-ui/eve` runtime and a test reads
 * what left the device.
 *
 * `fakeArnold.install()` (in a test's `beforeEach`) puts it in the global
 * `fetch`'s place, so every eve request goes to it and a request to any other
 * host throws at once: eve's client calls the global `fetch` itself, with no
 * seam to inject one through. The test points the app at it with
 * `process.env.EXPO_PUBLIC_ARNOLD_URL = fakeArnold.baseUrl` (`getArnoldUrl`
 * reads it per call). `after-each.ts` puts the real `fetch` back, so a test
 * that doesn't install it is untouched.
 *
 * It creates sessions, records every sent message's parts (`sent`, with each
 * file part's data), and streams a turn back as eve 1.0 does, in stream
 * version 27: NDJSON lines, each either a commit (`{ at, facts }`, every fact
 * one state change recorded) or a progress record (`{ progress }`), a line's
 * place in the stream being its position. A turn is the message's
 * `delivery.admitted` (with `session.started` on the first), `turn.started`
 * with its `delivery.consumed` echo, whose file parts are metadata only
 * (`kind`, `mediaType`, `filename`, `size`, never the bytes), the model run
 * (`model.requested` / `model.started`, a `content.delta`, then
 * `content.completed` with the canned answer, `reply`, and `model.settled`),
 * and `turn.settled` with the delivery's `delivery.settled`.
 * `failNextSend` refuses or fails the next send.
 */

import type { CommitLine, Fact, ProgressLine, UserPart } from "eve/events";
import { z } from "zod";

const clientContextSchema = z.record(z.string(), z.json());

type ClientContext = z.infer<typeof clientContextSchema>;

const sentPartSchema = z.discriminatedUnion("type", [
  z.object({ text: z.string(), type: z.literal("text") }),
  z.object({
    data: z.string(),
    filename: z.string().optional(),
    mediaType: z.string(),
    type: z.literal("file"),
  }),
]);

const requestBodySchema = z.object({
  clientContext: clientContextSchema.optional().catch(undefined),
  message: z
    .union([
      z.string().transform((text): SentPart[] => [{ text, type: "text" }]),
      z.array(sentPartSchema),
    ])
    .catch([])
    .optional(),
});

type ArnoldRequestBody = z.infer<typeof requestBodySchema>;

interface AcceptedResponse {
  deliveryId?: string;
  ok: true;
  sessionId: string;
  status: "accepted";
}

type ArnoldResponse =
  | AcceptedResponse
  | { code: string; error: string; eveVersion?: string; ok: false }
  | { deliveryId: string; ok: true; sessionId: string };

/** One stored line of a session's stream. */
type StoredLine = CommitLine<Fact> | ProgressLine;

/** The host the fake answers on; the app's `EXPO_PUBLIC_ARNOLD_URL` in tests. */
export const FAKE_ARNOLD_URL = "http://arnold.test";

/** The assistant answer the fake streams back when a test sets no other. */
export const FAKE_ARNOLD_REPLY = "Here is your answer.";

/** A text part of a sent message, as the fake received it. */
export interface SentTextPart {
  text: string;
  type: "text";
}

/** A file part of a sent message, its data (a `data:` URL) included. */
export interface SentFilePart {
  data: string;
  filename?: string;
  mediaType: string;
  type: "file";
}

export type SentPart = SentFilePart | SentTextPart;

/** One message the app sent Arnold. */
export interface SentMessage {
  /** The turn's client context (`clientContext`): the model and language. */
  clientContext?: ClientContext;
  parts: SentPart[];
  sessionId: string;
  /** The message's text parts joined, for a test that only reads the text. */
  text: string;
}

/**
 * How the fake fails the next send: Arnold's Pro refusal (the paywall), its
 * Pro check being unavailable, a send that never reached it, or any other
 * status and code.
 */
export type ArnoldFailure =
  | "network"
  | "pro-check-unavailable"
  | "pro-required"
  | { code?: string; status: number };

const failureResponses = {
  "pro-check-unavailable": {
    code: "arnold_pro_check_unavailable",
    status: 503,
  },
  "pro-required": { code: "arnold_pro_required", status: 403 },
} as const;

interface FakeSession {
  closed: boolean;
  /** The session's stream, a line per position. */
  lines: StoredLine[];
  /** The turn the next one follows, `null` before the first. */
  lastTurnId: string | null;
  /**
   * The rest of each accepted turn, still to be written. eve runs a turn
   * after it has accepted the message, so a reader following the stream reads
   * it live, past the tail it opened at: only then does the client count it as
   * a turn that finished (`onFinish`) rather than history it caught up on.
   */
  pending: (() => void)[];
  /** Whether `pending` is already due to run. */
  pendingDue: boolean;
  /** Tells every open stream of the session to serve what it hasn't yet. */
  notify: () => void;
  /** Each open stream's own `flush`, called by `notify`. */
  readers: Set<() => void>;
  sessionId: string;
  turns: number;
}

const encoder = new TextEncoder();

/** `/eve/v1/session/:sessionId`, with the control route it may carry. */
const SESSION_ROUTE =
  /^\/eve\/v1\/session\/(?<sessionId>[^/]+)(?<action>\/[a-z]+)?$/u;

let lineCount = 0;

/** A commit's time: a second apart, so a test reads them in order. */
const at = () => {
  lineCount += 1;

  return new Date(Date.UTC(2026, 0, 1, 0, 0, lineCount)).toISOString();
};

/** The bytes a `data:…;base64,…` URL carries, 0 for anything else. */
const dataUrlByteLength = (data: string): number => {
  const base64 = data.startsWith("data:") ? data.split(",")[1] : undefined;

  if (base64 === undefined) {
    return 0;
  }

  let padding = 0;

  if (base64.endsWith("==")) {
    padding = 2;
  } else if (base64.endsWith("=")) {
    padding = 1;
  }

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

/**
 * eve echoes a sent part on `delivery.consumed`: a file part as its metadata
 * only, never its bytes or a URL, under `kind` (the wire's `type` names the
 * event).
 */
const consumedPart = (part: SentPart): UserPart => {
  if (part.type === "text") {
    return { kind: "text", text: part.text };
  }

  const consumed: Extract<UserPart, { kind: "file" }> = {
    kind: "file",
    mediaType: part.mediaType,
    size: dataUrlByteLength(part.data),
  };

  if (part.filename) {
    return { ...consumed, filename: part.filename };
  }

  return consumed;
};

const json = (body: ArnoldResponse, status: number, headers?: HeadersInit) =>
  Response.json(body, { headers, status });

/**
 * The session stream's answer, with the fake's own stream as its body.
 *
 * Not a `Response`: `new Response(stream)` hands the body to Node's own
 * wrapper, which pumps it into a byte stream of its own, and a chunk the
 * wrapper reads after eve's reader dropped it throws out of Node
 * ("Invalid state: ReadableStream is already closed", a `pull` or a close
 * the fake can't guard). The fake is the whole network here, so eve reads
 * the stream directly: `openStreamBody` takes `ok`, `body`, `headers`,
 * `status` and `text()` off it and nothing else.
 */
const streamResponse = (
  body: ReadableStream<Uint8Array>,
  headers: Headers
): Response =>
  // SAFETY: eve reads only these Response members; the body must bypass Node's
  // Response wrapper, as documented above, to keep stream cancellation safe.
  ({
    body,
    headers,
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(""),
  }) as Response;

const errorResponse = (status: number, code: string, message: string) =>
  json({ code, error: message, ok: false }, status);

/** eve's answer for a session another eve version built. */
const strandedResponse = () =>
  json(
    {
      code: "session_stranded",
      error: "This session was built by another eve version.",
      eveVersion: "0.81.0",
      ok: false,
    },
    409
  );

const newSession = (sessionId: string): FakeSession => {
  const readers = new Set<() => void>();

  return {
    closed: false,
    lastTurnId: null,
    lines: [],
    pending: [],
    pendingDue: false,
    notify: () => {
      for (const flush of readers) {
        flush();
      }
    },
    readers,
    sessionId,
    turns: 0,
  };
};

/** Writes one commit line, every fact of one state change. */
const commit = (session: FakeSession, facts: Fact[]) => {
  session.lines.push({ at: at(), facts });
  session.notify();
};

/** Writes one progress record on a line of its own. */
const progress = (session: FakeSession, record: ProgressLine["progress"]) => {
  session.lines.push({ progress: record });
  session.notify();
};

/** Writes the session's accepted turns that are still to be written. */
const runPending = (session: FakeSession) => {
  for (const write of session.pending.splice(0)) {
    if (!session.closed) {
      write();
    }
  }
};

const readBody = (init: RequestInit): ArnoldRequestBody | undefined => {
  const body = z.string().safeParse(init.body);

  if (!body.success || body.data === "") {
    return;
  }

  const parsed = requestBodySchema.safeParse(JSON.parse(body.data));

  return parsed.success ? parsed.data : undefined;
};

class FakeArnold {
  baseUrl = FAKE_ARNOLD_URL;

  /** Every message the app sent, oldest first, with the parts it carried. */
  sent: SentMessage[] = [];

  /** The assistant answer each turn streams back. */
  reply = FAKE_ARNOLD_REPLY;

  /** Requests to a route the fake doesn't answer; they fail the test. */
  unhandled: string[] = [];

  private readonly sessions = new Map<string, FakeSession>();
  /** Sessions another eve version built, which this one can't continue. */
  private readonly stranded = new Set<string>();
  /** Bumped by `reset()`, so a request in flight then answers nothing. */
  private epoch = 0;
  private failures: ArnoldFailure[] = [];
  /** How many of the next turns fail after their message was echoed. */
  private failTurns = 0;
  private holds: Promise<void>[] = [];
  private sessionCount = 0;
  private deliveryCount = 0;
  private realFetch: typeof globalThis.fetch | undefined;

  /** Puts the fake in the global `fetch`'s place until `reset()`. */
  install() {
    if (this.realFetch) {
      return;
    }

    this.realFetch = globalThis.fetch;
    globalThis.fetch = this.fetch;
  }

  get installed() {
    return this.realFetch !== undefined;
  }

  reset() {
    this.epoch += 1;

    if (this.realFetch) {
      globalThis.fetch = this.realFetch;
      this.realFetch = undefined;
    }

    for (const session of this.sessions.values()) {
      session.closed = true;
      session.notify();
    }

    this.sessions.clear();
    this.stranded.clear();
    this.sent = [];
    this.unhandled = [];
    this.failures = [];
    this.failTurns = 0;
    this.holds = [];
    this.reply = FAKE_ARNOLD_REPLY;
    this.sessionCount = 0;
    this.deliveryCount = 0;
    lineCount = 0;
  }

  /** Makes the next send fail, as Arnold refuses or fails one. */
  failNextSend(failure: ArnoldFailure) {
    this.failures.push(failure);
  }

  /**
   * Accepts and echoes the next send, then fails its turn (`turn.settled`
   * with the outcome `failed`),
   * as a turn that breaks after the model has the message does: the message
   * stays in the Conversation and its saved events while the client reports
   * an error. Tell it from `failNextSend`, where nothing was ever accepted.
   */
  failNextTurn() {
    this.failTurns += 1;
  }

  /**
   * Holds the next send's answer until the returned function is called, so a
   * test sees the Conversation while eve's own optimistic message stands for
   * the one Arnold hasn't echoed yet.
   */
  holdNextSend(): () => void {
    let release = () => {
      // Replaced below; a hold released before it is taken is a no-op.
    };

    this.holds.push(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );

    return () => release();
  }

  /**
   * Makes `sessionId` a session eve ≤ 0.81.0 built, as every Conversation
   * from before 2026-11-14 is: eve 1.0 can never continue it, so following
   * its stream, sending to it or controlling it answers `409
   * session_stranded`, which eve's client reports without retrying.
   */
  strandSession(sessionId: string) {
    this.stranded.add(sessionId);
  }

  /** The sessions the app created, oldest first. */
  get sessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  fetch = async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);

    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new Error(
        `Fake Arnold: a test reached ${url.origin}, which is not Arnold. Stand that host in for the test.`
      );
    }

    const { epoch } = this;
    // Answers on a later macrotask, like a network response.
    const { promise, resolve } = Promise.withResolvers<undefined>();
    setTimeout(resolve, 0);
    await promise;

    // The test that sent it is over (`reset()`), so it records nothing and
    // creates nothing: its session is gone, as it is after a real reset.
    if (epoch !== this.epoch) {
      return errorResponse(
        409,
        "session_not_active",
        "The session is no longer active."
      );
    }

    return await this.respond(url, init);
  };

  private respond(url: URL, init: RequestInit): Promise<Response> | Response {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname } = url;

    if (method === "POST" && pathname === "/eve/v1/session") {
      return this.createSession(init);
    }

    const session = SESSION_ROUTE.exec(pathname);

    if (session?.groups?.sessionId) {
      const { sessionId, action } = session.groups;
      const id = decodeURIComponent(sessionId);

      if (method === "POST" && action === undefined) {
        return this.send(id, init);
      }

      if (method === "GET" && action === "/stream") {
        return this.stream(id, url);
      }

      if (method === "POST" && action === "/end") {
        return this.control(id, "end");
      }

      if (method === "POST" && action === "/cancel") {
        return this.control(id, "cancel");
      }
    }

    const route = `${method} ${pathname}`;
    this.unhandled.push(route);

    return errorResponse(501, "not_implemented", `Fake Arnold: no ${route}`);
  }

  private async createSession(init: RequestInit) {
    const body = readBody(init);

    if (body?.message !== undefined) {
      await this.takeHold();
    }

    // A refused or failed first send never creates the session, as the
    // channel refuses the request before eve starts one.
    if (body?.message !== undefined) {
      const failed = this.takeFailure();

      if (failed) {
        return failed;
      }
    }

    this.sessionCount += 1;
    const sessionId = `wrun_fake_${this.sessionCount}`;
    const session = newSession(sessionId);
    this.sessions.set(sessionId, session);

    const accepted: AcceptedResponse = {
      ok: true,
      sessionId,
      status: "accepted",
    };

    if (body?.message !== undefined) {
      accepted.deliveryId = this.runTurn(session, body);
    }

    return json(accepted, 202, { "x-eve-session-id": sessionId });
  }

  private async send(sessionId: string, init: RequestInit) {
    await this.takeHold();

    if (this.stranded.has(sessionId)) {
      return strandedResponse();
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      return errorResponse(
        409,
        "session_not_active",
        "The session is no longer active."
      );
    }

    const failed = this.takeFailure();

    if (failed) {
      return failed;
    }

    const body = readBody(init);
    const deliveryId = this.runTurn(session, body ?? {});

    return json({ deliveryId, ok: true, sessionId, status: "accepted" }, 202);
  }

  /** Waits for the hold a test put on this send, if there is one. */
  private takeHold() {
    return this.holds.shift();
  }

  /** The queued failure for this send, if any; `network` never answers. */
  private takeFailure() {
    const failure = this.failures.shift();

    if (failure === undefined) {
      return;
    }

    if (failure === "network") {
      throw new TypeError("Network request failed");
    }

    const { code, status } =
      failure === "pro-check-unavailable" || failure === "pro-required"
        ? failureResponses[failure]
        : failure;

    return errorResponse(
      status,
      code ?? "internal_error",
      "Arnold says no (the fake's own message)"
    );
  }

  /**
   * A control, recorded as its own delivery: a cancel is ignored, since a
   * fake turn never waits on anything a cancel could stop; an end retires the
   * session, which then refuses every request and closes its streams.
   */
  private control(sessionId: string, kind: "cancel" | "end") {
    if (this.stranded.has(sessionId)) {
      return strandedResponse();
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      return errorResponse(
        409,
        "session_not_active",
        "The session is no longer active."
      );
    }

    const deliveryId = this.nextDeliveryId();

    const admitted: Fact = {
      data: { deliveryId, source: { control: kind } },
      type: "delivery.admitted",
    };

    if (kind === "cancel") {
      commit(session, [admitted]);
      commit(session, [
        {
          data: { deliveryId, outcome: "ignored" },
          type: "delivery.settled",
        },
      ]);
    } else {
      commit(session, [
        admitted,
        {
          data: { deliveryId, outcome: "applied" },
          type: "delivery.settled",
        },
        { data: { outcome: "completed" }, type: "session.ended" },
      ]);
      session.closed = true;
      session.notify();
      this.sessions.delete(sessionId);
    }

    return json({ deliveryId, ok: true, sessionId }, 202);
  }

  private nextDeliveryId() {
    this.deliveryCount += 1;

    return `dlv_fake_${this.deliveryCount}`;
  }

  /** Records the message and appends the turn eve would stream back. */
  private runTurn(session: FakeSession, body: ArnoldRequestBody) {
    const parts = body.message ?? [];

    const text = parts
      .filter((part): part is SentTextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    const sent: SentMessage = {
      parts,
      sessionId: session.sessionId,
      text,
    };

    if (body.clientContext !== undefined) {
      sent.clientContext = body.clientContext;
    }

    this.sent.push(sent);
    const deliveryId = this.nextDeliveryId();
    const turnId = `turn_${session.turns}`;
    const runId = `run_fake_${session.turns}`;
    const partId = `part_fake_${session.turns}`;
    const follows = session.lastTurnId;
    const first = session.turns === 0;
    session.turns += 1;
    session.lastTurnId = turnId;

    const admitted: Fact = {
      data: {
        deliveryId,
        principal: { id: "user_fake", type: "user" },
        source: { channel: "eve" },
      },
      type: "delivery.admitted",
    };

    // A new session is set up in the same line as its first message, which
    // eve admits before it answers the send.
    commit(
      session,
      first ? [{ data: {}, type: "session.started" }, admitted] : [admitted]
    );
    session.pending.push(() =>
      this.writeTurn(session, {
        deliveryId,
        follows,
        parts,
        partId,
        runId,
        turnId,
      })
    );
    this.runPendingWhenRead(session);

    return deliveryId;
  }

  /** Writes an accepted turn, from its start to its settling. */
  private writeTurn(
    session: FakeSession,
    {
      deliveryId,
      follows,
      parts,
      partId,
      runId,
      turnId,
    }: {
      deliveryId: string;
      follows: string | null;
      parts: SentPart[];
      partId: string;
      runId: string;
      turnId: string;
    }
  ) {
    commit(session, [
      {
        data: { cause: { deliveryId }, follows, turnId },
        scope: { turnId },
        type: "turn.started",
      },
      {
        data: { deliveryId, parts: parts.map(consumedPart), turnId },
        scope: { turnId },
        type: "delivery.consumed",
      },
    ]);

    if (this.failTurns > 0) {
      this.failTurns -= 1;
      // Accepted and echoed, then the turn itself fails: the message stays
      // in the Conversation while the client reports an error.
      commit(session, [
        {
          data: {
            error: {
              code: "TURN_FAILED",
              message: "The turn failed (the fake's own message)",
            },
            outcome: "failed",
            turnId,
          },
          scope: { turnId },
          type: "turn.settled",
        },
        {
          data: { deliveryId, outcome: "handled", turnId },
          type: "delivery.settled",
        },
      ]);

      return;
    }

    const scope = { runId, turnId };

    commit(session, [
      { data: { owner: { turnId }, runId }, scope, type: "model.requested" },
      {
        data: { attempt: 0, modelId: "fake/arnold", runId },
        scope,
        type: "model.started",
      },
    ]);
    progress(session, {
      data: { delta: this.reply, kind: "text", partId },
      scope,
      type: "content.delta",
    });
    commit(session, [
      {
        data: {
          kind: "text",
          partId,
          phase: "reply",
          runId,
          value: this.reply,
        },
        scope,
        type: "content.completed",
      },
      {
        data: { finishReason: "stop", outcome: "completed", runId },
        scope,
        type: "model.settled",
      },
    ]);
    commit(session, [
      {
        data: { outcome: "completed", reply: [partId], turnId },
        scope: { turnId },
        type: "turn.settled",
      },
      {
        data: { deliveryId, outcome: "handled", turnId },
        type: "delivery.settled",
      },
    ]);
  }

  /**
   * Runs the session's pending turns on a later macrotask once a reader
   * follows the stream, so it reads them live; `runPending` writes them at
   * once for a reader that only reads up to the tail.
   */
  private runPendingWhenRead(session: FakeSession) {
    if (
      session.pendingDue ||
      session.pending.length === 0 ||
      session.readers.size === 0
    ) {
      return;
    }

    session.pendingDue = true;
    const { epoch } = this;

    setTimeout(() => {
      session.pendingDue = false;

      if (epoch === this.epoch) {
        runPending(session);
      }
    }, 0);
  }

  /**
   * The session's stream as NDJSON, a line per position, following it as eve
   * does: the stream stays open for the lines of later turns, ends with eve's
   * `stream.ended` record once the session has ended, and stops when the
   * reader drops it. `startIndex` and the tail index count lines.
   */
  private stream(sessionId: string, url: URL) {
    if (
      url.searchParams.get("follow") !== "false" &&
      this.stranded.has(sessionId)
    ) {
      return strandedResponse();
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      return errorResponse(
        409,
        "session_not_active",
        "The session is no longer active."
      );
    }

    // A read that stops at the tail finds every accepted turn written, as
    // one sent after the server has finished them would.
    if (url.searchParams.get("follow") === "false") {
      runPending(session);
    }

    const { lines } = session;
    const asked = Number(url.searchParams.get("startIndex") ?? "0");
    const follow = url.searchParams.get("follow") !== "false";
    const tailIndex = lines.length - 1;
    let index = asked < 0 ? Math.max(0, lines.length + asked) : asked;
    const last = follow ? Number.POSITIVE_INFINITY : tailIndex;
    // Pushed from the appending side rather than pulled, so the stream holds
    // no `pull` waiting for the next line when eve's reader drops it at a
    // turn boundary; serving a dropped stream is guarded on top of that.
    let ended = false;
    let flush: (() => void) | undefined;

    const body = new ReadableStream<Uint8Array>({
      cancel() {
        ended = true;

        if (flush) {
          session.readers.delete(flush);
        }
      },
      start(controller) {
        flush = () => {
          if (ended) {
            return;
          }

          try {
            while (index <= last && index < lines.length) {
              controller.enqueue(
                encoder.encode(`${JSON.stringify(lines[index])}\n`)
              );
              index += 1;
            }

            if (session.closed && index >= lines.length) {
              controller.enqueue(
                encoder.encode(`${JSON.stringify({ $eve: "stream.ended" })}\n`)
              );
            }

            if (index > last || session.closed) {
              ended = true;
              controller.close();
            }
          } catch {
            // The reader dropped the stream between two lines.
            ended = true;
          }

          if (ended && flush) {
            session.readers.delete(flush);
          }
        };

        session.readers.add(flush);
        flush();
      },
    });

    if (follow) {
      this.runPendingWhenRead(session);
    }

    const headers = new Headers({
      "content-type": "application/x-ndjson; charset=utf-8",
      "x-eve-stream-version": "27",
    });

    if (url.searchParams.get("includeTailIndex") === "1") {
      headers.set("x-eve-stream-tail-index", String(tailIndex));
    }

    return streamResponse(body, headers);
  }
}

export const fakeArnold = new FakeArnold();
