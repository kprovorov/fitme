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

import type { MessageStreamEvent } from "eve/client";

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
  clientContext?: Record<string, unknown>;
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
  /** Resolves on the next appended event, or once the session is closed. */
  appended: () => Promise<void>;
  closed: boolean;
  events: MessageStreamEvent[];
  notify: () => void;
  sessionId: string;
  turns: number;
}

const encoder = new TextEncoder();

/** `/eve/v1/session/:sessionId`, with the control route it may carry. */
const SESSION_ROUTE = /^\/eve\/v1\/session\/([^/]+)(\/[a-z]+)?$/;

let eventCount = 0;

function meta(deliveryId?: string) {
  eventCount += 1;
  return {
    at: new Date(Date.UTC(2026, 0, 1, 0, 0, eventCount)).toISOString(),
    ...(deliveryId ? { deliveryIds: [deliveryId] } : {}),
    id: `evt_${String(eventCount).padStart(26, "0")}`,
  };
}

/** eve answers a file part's echo with its metadata only, never its bytes. */
function receivedPart(part: SentPart) {
  if (part.type === "text") {
    return { text: part.text, type: "text" as const };
  }
  return {
    ...(part.filename ? { filename: part.filename } : {}),
    mediaType: part.mediaType,
    size: dataUrlByteLength(part.data),
    type: "file" as const,
  };
}

/** The bytes a `data:…;base64,…` URL carries, 0 for anything else. */
function dataUrlByteLength(data: string): number {
  const base64 = data.startsWith("data:") ? data.split(",")[1] : undefined;
  if (base64 === undefined) {
    return 0;
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function parseParts(message: unknown): SentPart[] {
  if (typeof message === "string") {
    return [{ text: message, type: "text" }];
  }
  return Array.isArray(message) ? (message as SentPart[]) : [];
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
    status,
  });
}

function errorResponse(status: number, code: string, message: string) {
  return json({ code, error: message, ok: false }, status);
}

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
    globalThis.fetch = this.fetch as typeof globalThis.fetch;
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
    const url = new URL(typeof input === "string" ? input : String(input));
    if (`${url.origin}` !== new URL(this.baseUrl).origin) {
      throw new Error(
        `Fake Arnold: a test reached ${url.origin}, which is not Arnold. Stand that host in for the test.`
      );
    }
    const { epoch } = this;
    // Answers on a later macrotask, like a network response.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The test that sent it is over (`reset()`), so it records nothing and
    // creates nothing: its session is gone, as it is after a real reset.
    if (epoch !== this.epoch) {
      return errorResponse(
        409,
        "session_not_active",
        "The session is no longer active."
      );
    }
    return this.respond(url, init);
  };

  private respond(url: URL, init: RequestInit): Promise<Response> | Response {
    const method = (init.method ?? "GET").toUpperCase();
    const { pathname } = url;
    if (method === "POST" && pathname === "/eve/v1/session") {
      return this.createSession(init);
    }
    const session = SESSION_ROUTE.exec(pathname);
    if (session) {
      const [, sessionId, action] = session;
      const id = decodeURIComponent(sessionId as string);
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
    const accepted: Record<string, unknown> = {
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
      typeof failure === "string" ? failureResponses[failure] : failure;
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
  private runTurn(session: FakeSession, body: Record<string, unknown>) {
    const parts = parseParts(body.message);
    const text = parts
      .filter((part): part is SentTextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    this.sent.push({
      ...(isRecord(body.clientContext)
        ? { clientContext: body.clientContext }
        : {}),
      parts,
      sessionId: session.sessionId,
      text,
    });
    this.deliveryCount += 1;
    const deliveryId = `dlv_fake_${this.deliveryCount}`;
    const turnId = `turn_${session.turns}`;
    const first = session.turns === 0;
    session.turns += 1;
    const append = (event: unknown) => {
      session.events.push(event as MessageStreamEvent);
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
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        // Caught up: wait for the next turn's events and be pulled again,
        // which is how eve's own stream stays open between turns.
        if (index >= session.events.length) {
          if (follow && !session.closed) {
            await session.appended();
          } else {
            controller.close();
          }
          return;
        }
        controller.enqueue(
          encoder.encode(`${JSON.stringify(session.events[index])}\n`)
        );
        index += 1;
        if (!follow && index > tailIndex) {
          controller.close();
        }
      },
    });
    const headers: Record<string, string> = {
      "content-type": "application/x-ndjson",
      "x-eve-stream-version": "26",
    };
    if (url.searchParams.get("includeTailIndex") === "1") {
      headers["x-eve-stream-tail-index"] = String(tailIndex);
    }
    return new Response(body, { headers, status: 200 });
  }
}

function newSession(sessionId: string): FakeSession {
  let waiting = Promise.withResolvers<void>();
  const session: FakeSession = {
    appended: () => waiting.promise,
    closed: false,
    events: [],
    notify: () => {
      waiting.resolve();
      waiting = Promise.withResolvers();
    },
    sessionId,
    turns: 0,
  };
  return session;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBody(init: RequestInit): Record<string, unknown> | undefined {
  if (typeof init.body !== "string" || init.body === "") {
    return;
  }
  const parsed = JSON.parse(init.body) as unknown;
  return isRecord(parsed) ? parsed : undefined;
}

export const fakeArnold = new FakeArnold();
