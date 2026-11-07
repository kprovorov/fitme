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
 * file part's data), and streams a turn back as eve does: a `message.received`
 * echo whose file parts are metadata only (`mediaType`, `filename`, `size`,
 * never the bytes), then the canned assistant answer (`reply`).
 * `failNextSend` refuses or fails the next send.
 */

import type {
  MessageReceivedPart,
  MessageStreamEvent,
  MessageStreamEventMeta,
} from "eve/client";
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
  | { code: string; error: string; ok: false }
  | { ok: true; previousSessionId: string; status: "reset" }
  | { ok: true; status: "no_active_session" | "no_active_turn" };

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
  events: MessageStreamEvent[];
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

let eventCount = 0;

const meta = (deliveryId?: string): MessageStreamEventMeta => {
  eventCount += 1;

  const eventMeta: MessageStreamEventMeta = {
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, eventCount)).toISOString(),
    id: `evt_${String(eventCount).padStart(26, "0")}`,
  };

  if (deliveryId) {
    return { ...eventMeta, deliveryIds: [deliveryId] };
  }

  return eventMeta;
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

/** eve answers a file part's echo with its metadata only, never its bytes. */
const receivedPart = (part: SentPart): MessageReceivedPart => {
  if (part.type === "text") {
    return { text: part.text, type: "text" };
  }

  const received: MessageReceivedPart = {
    mediaType: part.mediaType,
    size: dataUrlByteLength(part.data),
    type: "file",
  };

  if (part.filename) {
    return { ...received, filename: part.filename };
  }

  return received;
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

const newSession = (sessionId: string): FakeSession => {
  const readers = new Set<() => void>();

  return {
    closed: false,
    events: [],
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
  /** Bumped by `reset()`, so a request in flight then answers nothing. */
  private epoch = 0;
  private failures: ArnoldFailure[] = [];
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
    this.sent = [];
    this.unhandled = [];
    this.failures = [];
    this.reply = FAKE_ARNOLD_REPLY;
    this.sessionCount = 0;
    this.deliveryCount = 0;
  }

  /** Makes the next send fail, as Arnold refuses or fails one. */
  failNextSend(failure: ArnoldFailure) {
    this.failures.push(failure);
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

      if (method === "POST" && action === "/reset") {
        return this.resetSession(id);
      }

      if (method === "POST" && action === "/cancel") {
        return json({ ok: true, status: "no_active_turn" }, 200);
      }
    }

    const route = `${method} ${pathname}`;
    this.unhandled.push(route);

    return errorResponse(501, "not_implemented", `Fake Arnold: no ${route}`);
  }

  private createSession(init: RequestInit) {
    const body = readBody(init);

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

  private send(sessionId: string, init: RequestInit) {
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

  private resetSession(sessionId: string) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return json({ ok: true, status: "no_active_session" }, 200);
    }

    session.closed = true;
    session.notify();
    this.sessions.delete(sessionId);

    return json(
      { ok: true, previousSessionId: sessionId, status: "reset" },
      200
    );
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
    this.deliveryCount += 1;
    const deliveryId = `dlv_fake_${this.deliveryCount}`;
    const turnId = `turn_${session.turns}`;
    const first = session.turns === 0;
    session.turns += 1;

    const append = (event: MessageStreamEvent) => {
      session.events.push(event);
      session.notify();
    };

    if (first) {
      append({ data: {}, meta: meta(), type: "session.started" });
    }

    append({
      data: { sequence: 0, turnId },
      meta: meta(deliveryId),
      type: "turn.started",
    });
    append({
      data: {
        message: text,
        parts: parts.map(receivedPart),
        sequence: 1,
        turnId,
      },
      meta: meta(deliveryId),
      type: "message.received",
    });
    append({
      data: { messageDelta: this.reply, sequence: 2, stepIndex: 0, turnId },
      meta: meta(deliveryId),
      type: "message.appended",
    });
    append({
      data: {
        finishReason: "stop",
        message: this.reply,
        sequence: 3,
        stepIndex: 0,
        turnId,
      },
      meta: meta(deliveryId),
      type: "message.completed",
    });
    append({
      data: { sequence: 4, turnId },
      meta: meta(deliveryId),
      type: "turn.completed",
    });
    append({
      data: { continuationToken: session.sessionId, wait: "next-user-message" },
      meta: meta(deliveryId),
      type: "session.waiting",
    });

    return deliveryId;
  }

  /**
   * The session's events as NDJSON, following it as eve does: the stream stays
   * open for the events of later turns and ends when the reader drops it.
   */
  private stream(sessionId: string, url: URL) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return errorResponse(
        409,
        "session_not_active",
        "The session is no longer active."
      );
    }

    const asked = Number(url.searchParams.get("startIndex") ?? "0");
    const follow = url.searchParams.get("follow") !== "false";
    const tailIndex = session.events.length - 1;
    let index = asked < 0 ? Math.max(0, session.events.length + asked) : asked;
    const last = follow ? Number.POSITIVE_INFINITY : tailIndex;
    // Pushed from the appending side rather than pulled, so the stream holds
    // no `pull` waiting for the next event when eve's reader drops it at a
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
            while (index <= last && index < session.events.length) {
              controller.enqueue(
                encoder.encode(`${JSON.stringify(session.events[index])}\n`)
              );
              index += 1;
            }

            if (index > last || session.closed) {
              ended = true;
              controller.close();
            }
          } catch {
            // The reader dropped the stream between two events.
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

    const headers = new Headers({
      "content-type": "application/x-ndjson",
      "x-eve-stream-version": "26",
    });

    if (url.searchParams.get("includeTailIndex") === "1") {
      headers.set("x-eve-stream-tail-index", String(tailIndex));
    }

    return streamResponse(body, headers);
  }
}

export const fakeArnold = new FakeArnold();
