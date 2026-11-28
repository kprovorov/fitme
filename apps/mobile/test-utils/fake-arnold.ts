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
 * `failNextSend` refuses or fails the next send, and `callToolsNextTurn`
 * has the next turn's model call tools first (`call.requested`,
 * `call.started`, `call.settled` with each one's output or error), the
 * answer coming from a second model run, as a turn calling a tool does.
 * `holdNextToolCall` has the next turn stop once its tool call has started
 * (requested and started, not settled), optionally after streaming some
 * narration, until the test releases it. A cancel (`/cancel`) during such a
 * held turn ends it as eve does: the call `interrupted`, the turn settled
 * `cancelled` with the cancel as its cause, its message's delivery `handled`
 * and the cancel `applied`, all in one commit; the narration already streamed
 * stays, and nothing more is written for that turn. A cancel with no turn
 * waiting, or guarded for another turn, is recorded as ignored.
 * `holdNextToolCallForApproval` has the next turn pause on a call waiting
 * for the User's approval, as `docs/research/arnold-tool-approval.md`
 * recorded from a real eve: Approve runs it, Deny rejects it, a message
 * withdraws it, each continuing the paused turn, and every answer request
 * is recorded in `responses`.
 */

import type { CommitLine, Fact, ProgressLine, UserPart } from "eve/events";
import { z } from "zod";

const clientContextSchema = z.record(z.string(), z.json());

type ClientContext = z.infer<typeof clientContextSchema>;

/** A JSON value: a tool call's input entries and its output. */
type Json = z.infer<ReturnType<typeof z.json>>;

const sentPartSchema = z.discriminatedUnion("type", [
  z.object({ text: z.string(), type: z.literal("text") }),
  z.object({
    data: z.string(),
    filename: z.string().optional(),
    mediaType: z.string(),
    type: z.literal("file"),
  }),
]);

/** A cancel's body: the turn it may stop, `null` for no observed turn. */
const cancelBodySchema = z.object({
  turnId: z.string().nullable().optional(),
});

/** One answer to an interaction, as eve's client sends it. */
const answerSchema = z.object({
  interactionId: z.string(),
  optionId: z.string().optional(),
  text: z.string().optional(),
});

const requestBodySchema = z.object({
  answers: z.array(answerSchema).optional().catch(undefined),
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

/**
 * A tool call the next turn makes before it answers: completed with its
 * `output`, or failed with an `error` message (a thrown tool error).
 */
export type FakeToolCall =
  | { input?: ClientContext; name: string; output: Json }
  | { error: string; input?: ClientContext; name: string };

/** One answer to an interaction (an approval), as the app sent it. */
export type SentAnswer = z.infer<typeof answerSchema>;

/** One answer request the app sent Arnold (Approve or Deny on a waiting call). */
export interface SentResponse {
  answers: SentAnswer[];
  /** The request's client context, as a message's. */
  clientContext?: ClientContext;
  sessionId: string;
}

/** The options every eve approval declares, in order. */
const APPROVAL_OPTIONS = [
  { id: "approve", label: "Approve" },
  { id: "deny", label: "Deny" },
] as const;

/** What eve tells the model about a call whose approval a message withdrew. */
const WITHDRAWN = "Ignored because the user continued without responding.";

/** A tool call the next turn holds for the User's approval. */
interface ApprovalCall {
  call: FakeToolCall;
  /** The question the approval puts, eve's `request.prompt`. */
  prompt: string;
}

/** A turn paused on a call's approval: the call requested, never started. */
interface AwaitingApproval {
  call: FakeToolCall;
  callId: string;
  interactionId: string;
  /** The turn's own run ids and part id, for the answer after it goes on. */
  partId: string;
  runId: string;
  turnId: string;
}

const failureResponses = {
  "pro-check-unavailable": {
    code: "arnold_pro_check_unavailable",
    status: 503,
  },
  "pro-required": { code: "arnold_pro_required", status: 403 },
} as const;

/** A tool call a test holds the next turn on, until it releases it. */
interface HeldToolCall {
  call: FakeToolCall;
  /** Text the model streams before it calls the tool, as `narration`. */
  narration?: string;
  /** Whether the test let it go on before the turn reached it. */
  released: boolean;
  /** Writes the rest of the turn, once the turn is waiting on the call. */
  resume?: () => void;
}

/** A turn waiting on a held tool call: started, never settled yet. */
interface WaitingTurn {
  /** The call it waits on, requested and started. */
  callId: string;
  /** The delivery of the message that started it. */
  deliveryId: string;
  turnId: string;
}

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
  /** The turn waiting on a held tool call, which a cancel can stop. */
  waiting?: WaitingTurn;
  /** The turn paused on a call's approval, until an answer or a message. */
  awaiting?: AwaitingApproval;
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

/** A call's `call.settled`: completed with its output, or failed. */
const callSettled = (
  callId: string,
  call: FakeToolCall,
  turnId: string
): Fact =>
  "error" in call
    ? {
        data: {
          callId,
          error: { code: "TOOL_FAILED", message: call.error },
          outcome: "failed",
        },
        scope: { turnId },
        type: "call.settled",
      }
    : {
        data: { callId, outcome: "completed", output: call.output },
        scope: { turnId },
        type: "call.settled",
      };

/**
 * Cancels the turn waiting on a held tool call, unless the cancel names
 * another turn (`turnId`, `null` for none observed), as eve settles a
 * cancelled turn: everything open under it closed first (the call
 * `interrupted` by `turn-cancelled`), then `turn.settled` `cancelled` with
 * the cancel as its cause, then its message's delivery `handled`, the cancel
 * admitted and applied around them in the same commit. Answers whether it
 * cancelled one.
 */
const cancelWaitingTurn = (
  session: FakeSession,
  {
    admitted,
    cancelId,
    init,
  }: { admitted: Fact; cancelId: string; init: RequestInit }
) => {
  // A turn accepted but not written yet runs first, as eve has started it
  // by the time a cancel arrives: up to its hold, or through.
  runPending(session);

  const { waiting } = session;
  const body = z.string().safeParse(init.body);

  const guard =
    body.success && body.data !== ""
      ? cancelBodySchema.safeParse(JSON.parse(body.data))
      : undefined;

  const turnId = guard?.success ? guard.data.turnId : undefined;

  if (!waiting || (turnId !== undefined && turnId !== waiting.turnId)) {
    return false;
  }

  session.waiting = undefined;
  const scope = { turnId: waiting.turnId };

  commit(session, [
    admitted,
    {
      data: {
        callId: waiting.callId,
        outcome: "interrupted",
        reason: "turn-cancelled",
      },
      scope,
      type: "call.settled",
    },
    {
      data: {
        cause: { deliveryId: cancelId },
        outcome: "cancelled",
        turnId: waiting.turnId,
      },
      scope,
      type: "turn.settled",
    },
    {
      data: {
        deliveryId: waiting.deliveryId,
        outcome: "handled",
        turnId: waiting.turnId,
      },
      type: "delivery.settled",
    },
    {
      data: { deliveryId: cancelId, outcome: "applied" },
      type: "delivery.settled",
    },
  ]);

  return true;
};

/** A user message's `delivery.admitted`. */
const userAdmitted = (deliveryId: string): Fact => ({
  data: {
    deliveryId,
    principal: { id: "user_fake", type: "user" },
    source: { channel: "eve" },
  },
  type: "delivery.admitted",
});

/** The next turn's ids, the turn it follows, and the session moved past it. */
const nextTurn = (session: FakeSession) => {
  const turnId = `turn_${session.turns}`;

  const next = {
    follows: session.lastTurnId,
    partId: `part_fake_${session.turns}`,
    runId: `run_fake_${session.turns}`,
    turnId,
  };

  session.turns += 1;
  session.lastTurnId = turnId;

  return next;
};

/**
 * The approval option a message answers when its whole text is an option's
 * id, label or number, as eve reads a typed answer ("approve", "Approve",
 * "1"); anything else ("yes", "Approve.") withdraws the approval instead.
 */
const typedOption = (parts: SentPart[], text: string) => {
  if (parts.some((part) => part.type !== "text")) {
    return;
  }

  return APPROVAL_OPTIONS.find(
    (option, index) =>
      text === option.id || text === option.label || text === String(index + 1)
  )?.id;
};

/**
 * Refuses an answer request the fake doesn't model, so a test never reads a
 * stream real eve wouldn't write: a body carrying both a message and answers
 * (eve takes exactly one), and, while a call waits, answers that don't settle
 * it (another interaction, or an option it doesn't offer). An answer with
 * nothing waiting is eve's stale answer, which starts an empty turn.
 */
const refuseAnswers = (session: FakeSession, body: ArnoldRequestBody) => {
  if (body.answers === undefined) {
    return;
  }

  if (body.message !== undefined) {
    return errorResponse(
      400,
      "invalid_request",
      "Fake Arnold: a send carries a message or answers, never both."
    );
  }

  const { awaiting } = session;

  if (awaiting && !answersApproval(awaiting, body.answers)) {
    return errorResponse(
      400,
      "invalid_request",
      `Fake Arnold: no answer settles ${awaiting.interactionId}, the approval the turn waits on.`
    );
  }
};

/** The answer that settles the waiting approval, if one does. */
const answersApproval = (awaiting: AwaitingApproval, answers: SentAnswer[]) =>
  answers.find(
    (answer) =>
      answer.interactionId === awaiting.interactionId &&
      APPROVAL_OPTIONS.some((option) => option.id === answer.optionId)
  );

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

  /** Every answer request (Approve, Deny) the app sent, oldest first. */
  responses: SentResponse[] = [];

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
  /** The tool calls each of the next turns makes, in turn order. */
  private toolCalls: FakeToolCall[][] = [];
  /** The held tool call each of the next turns stops on, in turn order. */
  private heldCalls: HeldToolCall[] = [];
  /** The call each of the next turns holds for approval, in turn order. */
  private approvalCalls: ApprovalCall[] = [];
  private callCount = 0;
  private interactionCount = 0;
  private responseCount = 0;
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
    this.responses = [];
    this.unhandled = [];
    this.failures = [];
    this.failTurns = 0;
    this.toolCalls = [];
    this.heldCalls = [];
    this.approvalCalls = [];
    this.callCount = 0;
    this.interactionCount = 0;
    this.responseCount = 0;
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
   * Has the next turn's model call these tools, in order, before a second
   * model run answers with `reply`: each a `call.requested` owned by the
   * first run, which settles with the finish reason `tool-calls`, then its
   * `call.started` and `call.settled` (`completed` with its output, or
   * `failed` with its error).
   */
  callToolsNextTurn(calls: FakeToolCall[]) {
    this.toolCalls.push(calls);
  }

  /**
   * Has the next turn's model stream `narration` (if any), call `call` and
   * stop there: the call is requested and started, its model run settled
   * with `tool-calls`, and the turn open, so the stream stays open with the
   * call running. Calling the returned function settles the call (its output
   * or error) and writes the answer, `reply`, as `callToolsNextTurn` does; a
   * release before the turn gets there lets it run through, and one after the
   * turn was cancelled does nothing. A held call takes its turn instead of a
   * `callToolsNextTurn` batch, which waits for the next turn.
   */
  holdNextToolCall(
    call: FakeToolCall,
    { narration }: { narration?: string } = {}
  ): () => void {
    const held: HeldToolCall = { call, released: false };

    if (narration !== undefined) {
      held.narration = narration;
    }

    this.heldCalls.push(held);

    return () => {
      held.released = true;
      held.resume?.();
    };
  }

  /**
   * Has the next turn's model call `call` and pause there, holding the call
   * for the User's approval as eve does a tool with an approval policy: the
   * call requested, never started, `interaction.opened` asking `prompt` with
   * eve's Approve and Deny, then `turn.paused` and the message's delivery
   * settled `awaiting-input`. What the app sends next decides it, each
   * continuing the same turn: Approve (an `answers` body with `approve`) runs
   * the call (`call.started` cleared by the approval, then its output or
   * error) and writes the answer, `reply`; Deny ends the call `rejected`
   * (`TOOL_EXECUTION_DENIED`, quoting the User's note) and writes the answer;
   * a message withdraws the approval (`superseded-by-message`), ends the call
   * `rejected` and answers the message, unless its whole text is an option's
   * id, label or number, which answers the approval as eve reads a typed
   * answer. An answer to an approval that is no longer open starts a new,
   * empty turn with a model run, as eve does; while one waits, answers that
   * don't settle it, and a body with both a message and answers, are refused
   * (400), since the fake doesn't model them. A held approval takes its turn
   * before a `holdNextToolCall` or `callToolsNextTurn` one. A cancel while
   * it waits isn't modelled (it is recorded as ignored).
   */
  holdNextToolCallForApproval(
    call: FakeToolCall,
    { prompt }: { prompt?: string } = {}
  ) {
    this.approvalCalls.push({ call, prompt: prompt ?? `Run ${call.name}?` });
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
        return this.control(id, "end", init);
      }

      if (method === "POST" && action === "/cancel") {
        return this.control(id, "cancel", init);
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

    const body = readBody(init) ?? {};

    // A turn holding a call for approval is written before this request is
    // read, as eve has paused it by the time an answer can reach it.
    if (this.approvalCalls.length > 0 || body.answers !== undefined) {
      runPending(session);
    }

    const refused = refuseAnswers(session, body);

    if (refused) {
      return refused;
    }

    const deliveryId =
      body.answers === undefined
        ? this.runTurn(session, body)
        : this.answer(session, body, body.answers);

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
   * A control, recorded as its own delivery: a cancel stops the turn waiting
   * on a held tool call (`cancelWaitingTurn`) and is ignored with none, since every
   * other fake turn is written whole; an end retires the session, which then
   * refuses every request and closes its streams.
   */
  private control(
    sessionId: string,
    kind: "cancel" | "end",
    init: RequestInit
  ) {
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

    if (
      kind === "cancel" &&
      cancelWaitingTurn(session, { admitted, cancelId: deliveryId, init })
    ) {
      return json({ deliveryId, ok: true, sessionId }, 202);
    }

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

    const { awaiting } = session;

    if (awaiting) {
      const typed = typedOption(parts, text);

      return typed === undefined
        ? this.withdraw(session, awaiting, parts)
        : this.answer(
            session,
            body,
            [{ interactionId: awaiting.interactionId, optionId: typed }],
            parts
          );
    }

    const deliveryId = this.nextDeliveryId();
    const { follows, partId, runId, turnId } = nextTurn(session);
    const first = turnId === "turn_0";
    const admitted = userAdmitted(deliveryId);

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

    const approval = this.approvalCalls.shift();

    if (approval) {
      this.writeApprovalHold(session, approval, {
        deliveryId,
        partId,
        runId,
        turnId,
      });

      return;
    }

    const held = this.heldCalls.shift();

    if (held) {
      this.writeHeldCall(session, held, {
        deliveryId,
        partId,
        runId,
        turnId,
      });

      return;
    }

    const calls = this.toolCalls.shift() ?? [];

    if (calls.length > 0) {
      this.writeToolCalls(session, { calls, runId: `${runId}_tools`, turnId });
    }

    this.writeAnswer(session, { deliveryId, partId, runId, turnId });
  }

  /**
   * Answers the approval the session's turn is paused on, from an `answers`
   * body or a typed one (`typedParts`, the message it came in): Approve or
   * Deny continues that turn. An answer to no open approval starts a new,
   * empty turn with a model run, as eve does with one to an approval that
   * has already settled. Answers the request's delivery.
   */
  private answer(
    session: FakeSession,
    body: ArnoldRequestBody,
    answers: SentAnswer[],
    typedParts?: SentPart[]
  ) {
    if (typedParts === undefined) {
      const response: SentResponse = {
        answers,
        sessionId: session.sessionId,
      };

      if (body.clientContext !== undefined) {
        response.clientContext = body.clientContext;
      }

      this.responses.push(response);
    }

    const deliveryId = this.nextDeliveryId();
    commit(session, [userAdmitted(deliveryId)]);

    const { awaiting } = session;

    const answered = awaiting && answersApproval(awaiting, answers);

    if (!awaiting || !answered) {
      session.pending.push(() => this.writeEmptyTurn(session, deliveryId));
      this.runPendingWhenRead(session);

      return deliveryId;
    }

    session.awaiting = undefined;
    this.responseCount += 1;

    const responseId =
      typedParts === undefined
        ? `resp_fake_${this.responseCount}`
        : `resp_fake_${this.responseCount}_typed_0`;

    session.pending.push(() =>
      this.writeApprovalAnswer(session, awaiting, {
        answer: answered,
        deliveryId,
        parts: typedParts ?? [],
        responseId,
      })
    );
    this.runPendingWhenRead(session);

    return deliveryId;
  }

  /**
   * A message sent while a call waits for approval: the approval withdrawn
   * (`superseded-by-message`), the call `rejected` and never run, and the
   * message answered in the same turn.
   */
  private withdraw(
    session: FakeSession,
    awaiting: AwaitingApproval,
    parts: SentPart[]
  ) {
    session.awaiting = undefined;
    const deliveryId = this.nextDeliveryId();
    const { callId, interactionId, partId, runId, turnId } = awaiting;
    const scope = { turnId };
    commit(session, [userAdmitted(deliveryId)]);

    session.pending.push(() => {
      commit(session, [
        {
          data: {
            interactionId,
            outcome: "withdrawn",
            reason: "superseded-by-message",
          },
          scope,
          type: "interaction.settled",
        },
        {
          data: {
            callId,
            cause: { interactionId },
            error: { code: "TOOL_EXECUTION_DENIED", message: WITHDRAWN },
            outcome: "rejected",
            output: {
              approval: { interactionId, status: "ignored" },
              code: "TOOL_EXECUTION_DENIED",
              message: WITHDRAWN,
              tool: { result: "not_run" },
            },
          },
          scope,
          type: "call.settled",
        },
      ]);
      commit(session, [
        {
          data: { deliveryId, parts: parts.map(consumedPart), turnId },
          scope,
          type: "delivery.consumed",
        },
      ]);
      this.writeAnswer(session, { deliveryId, partId, runId, turnId });
    });
    this.runPendingWhenRead(session);

    return deliveryId;
  }

  /**
   * A model run calling the tool, then the call held for approval: the
   * interaction opened, the turn paused on it and the message's delivery
   * settled `awaiting-input`. The call never starts until it is approved.
   */
  private writeApprovalHold(
    session: FakeSession,
    approval: ApprovalCall,
    {
      deliveryId,
      partId,
      runId,
      turnId,
    }: { deliveryId: string; partId: string; runId: string; turnId: string }
  ) {
    const toolRunId = `${runId}_tools`;
    const scope = { runId: toolRunId, turnId };
    this.callCount += 1;
    this.interactionCount += 1;
    const callId = `call_fake_${this.callCount}`;
    const interactionId = `int_fake_${this.interactionCount}`;
    const { call, prompt } = approval;

    commit(session, [
      {
        data: { owner: { turnId }, runId: toolRunId },
        scope,
        type: "model.requested",
      },
      {
        data: { attempt: 0, modelId: "fake/arnold", runId: toolRunId },
        scope,
        type: "model.started",
      },
    ]);
    commit(session, [
      {
        data: {
          callId,
          capability: { kind: "tool", name: call.name },
          input: call.input ?? {},
          owner: { runId: toolRunId },
        },
        scope: { turnId },
        type: "call.requested",
      },
      {
        data: {
          finishReason: "tool-calls",
          outcome: "completed",
          runId: toolRunId,
        },
        scope,
        type: "model.settled",
      },
    ]);
    commit(session, [
      {
        data: {
          interactionId,
          request: {
            allowFreeform: false,
            display: "confirmation",
            kind: "approval",
            options: APPROVAL_OPTIONS.map((option) => ({ ...option })),
            prompt,
          },
          subject: { callId },
        },
        scope: { turnId },
        type: "interaction.opened",
      },
    ]);
    commit(session, [
      {
        data: { awaiting: [{ interactionId }], turnId },
        scope: { turnId },
        type: "turn.paused",
      },
      {
        data: { deliveryId, outcome: "awaiting-input", turnId },
        type: "delivery.settled",
      },
    ]);
    session.awaiting = { call, callId, interactionId, partId, runId, turnId };
  }

  /**
   * An answer to a waiting approval, as eve applies it: the response
   * submitted and applied, the approval settled `accepted` or `declined`,
   * the answer's delivery consumed by the paused turn, then the call run
   * (approved) or `rejected` (denied), and the turn's answer.
   */
  private writeApprovalAnswer(
    session: FakeSession,
    awaiting: AwaitingApproval,
    {
      answer,
      deliveryId,
      parts,
      responseId,
    }: {
      answer: SentAnswer;
      deliveryId: string;
      parts: SentPart[];
      responseId: string;
    }
  ) {
    const { call, callId, interactionId, partId, runId, turnId } = awaiting;
    const scope = { turnId };
    const approved = answer.optionId === "approve";
    const response: Record<string, Json> = { optionId: answer.optionId ?? "" };
    const value: Record<string, Json> = { optionId: answer.optionId ?? "" };

    if (answer.text !== undefined) {
      response.text = answer.text;
      value.text = answer.text;
    }

    commit(session, [
      {
        data: { deliveryId, interactionId, responseId, value },
        type: "response.submitted",
      },
      { data: { responseId }, type: "response.admitted" },
    ]);

    const consumed: Fact = {
      data: { deliveryId, parts: parts.map(consumedPart), turnId },
      scope,
      type: "delivery.consumed",
    };

    const applied: Fact = {
      data: { outcome: "applied", responseId },
      type: "response.settled",
    };

    if (approved) {
      commit(session, [
        applied,
        {
          data: { interactionId, outcome: "accepted", response },
          scope,
          type: "interaction.settled",
        },
      ]);
      commit(session, [consumed]);
      commit(session, [
        {
          data: { callId, clearedBy: { interactionId } },
          scope,
          type: "call.started",
        },
      ]);
      commit(session, [callSettled(callId, call, turnId)]);
    } else {
      const message =
        answer.text === undefined
          ? "Tool execution was denied."
          : `Tool execution was denied. The person who denied it wrote: "${answer.text}"`;

      commit(session, [applied]);
      commit(session, [
        {
          data: { interactionId, outcome: "declined", response },
          scope,
          type: "interaction.settled",
        },
        {
          data: {
            callId,
            cause: { interactionId },
            error: { code: "TOOL_EXECUTION_DENIED", message },
            outcome: "rejected",
            output: {
              approval: { interactionId, status: "denied" },
              code: "TOOL_EXECUTION_DENIED",
              message,
              tool: { result: "not_run" },
            },
          },
          scope,
          type: "call.settled",
        },
      ]);
      commit(session, [consumed]);
    }

    this.writeAnswer(session, { deliveryId, partId, runId, turnId });
  }

  /**
   * The turn eve starts for an answer to an approval that is no longer
   * open: nothing consumed, and a model run answering it all the same.
   */
  private writeEmptyTurn(session: FakeSession, deliveryId: string) {
    const { follows, partId, runId, turnId } = nextTurn(session);

    commit(session, [
      {
        data: { cause: { deliveryId }, follows, turnId },
        scope: { turnId },
        type: "turn.started",
      },
      {
        data: { deliveryId, parts: [], turnId },
        scope: { turnId },
        type: "delivery.consumed",
      },
    ]);
    this.writeAnswer(session, { deliveryId, partId, runId, turnId });
  }

  /** The model run answering a turn with `reply`, then the turn settled. */
  private writeAnswer(
    session: FakeSession,
    {
      deliveryId,
      partId,
      runId,
      turnId,
    }: { deliveryId: string; partId: string; runId: string; turnId: string }
  ) {
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
   * A model run that streams its narration (if any) and calls the held tool,
   * which starts and then waits: the turn stays open until the test releases
   * it (the call settled, then the answer) or a cancel stops it.
   */
  private writeHeldCall(
    session: FakeSession,
    held: HeldToolCall,
    {
      deliveryId,
      partId,
      runId,
      turnId,
    }: { deliveryId: string; partId: string; runId: string; turnId: string }
  ) {
    const toolRunId = `${runId}_tools`;
    const scope = { runId: toolRunId, turnId };
    this.callCount += 1;
    const callId = `call_fake_${this.callCount}`;
    const { call, narration } = held;

    commit(session, [
      {
        data: { owner: { turnId }, runId: toolRunId },
        scope,
        type: "model.requested",
      },
      {
        data: { attempt: 0, modelId: "fake/arnold", runId: toolRunId },
        scope,
        type: "model.started",
      },
    ]);

    if (narration !== undefined) {
      const narrationId = `${partId}_narration`;

      progress(session, {
        data: { delta: narration, kind: "text", partId: narrationId },
        scope,
        type: "content.delta",
      });
      commit(session, [
        {
          data: {
            kind: "text",
            partId: narrationId,
            phase: "narration",
            runId: toolRunId,
            value: narration,
          },
          scope,
          type: "content.completed",
        },
      ]);
    }

    commit(session, [
      {
        data: {
          callId,
          capability: { kind: "tool", name: call.name },
          input: call.input ?? {},
          owner: { runId: toolRunId },
        },
        scope: { turnId },
        type: "call.requested",
      },
      {
        data: {
          finishReason: "tool-calls",
          outcome: "completed",
          runId: toolRunId,
        },
        scope,
        type: "model.settled",
      },
    ]);
    commit(session, [
      { data: { callId }, scope: { turnId }, type: "call.started" },
    ]);
    session.waiting = { callId, deliveryId, turnId };

    const resume = () => {
      // Cancelled, ended or reset meanwhile: nothing more for this turn.
      if (session.closed || session.waiting?.turnId !== turnId) {
        return;
      }

      session.waiting = undefined;
      commit(session, [callSettled(callId, call, turnId)]);
      this.writeAnswer(session, { deliveryId, partId, runId, turnId });
    };

    if (held.released) {
      resume();
    } else {
      held.resume = resume;
    }
  }

  /**
   * A model run that calls tools, then each call run and settled, as eve
   * writes a turn's tool step before the model answers.
   */
  private writeToolCalls(
    session: FakeSession,
    {
      calls,
      runId,
      turnId,
    }: { calls: FakeToolCall[]; runId: string; turnId: string }
  ) {
    const scope = { runId, turnId };

    const callIds = calls.map(() => {
      this.callCount += 1;

      return `call_fake_${this.callCount}`;
    });

    commit(session, [
      { data: { owner: { turnId }, runId }, scope, type: "model.requested" },
      {
        data: { attempt: 0, modelId: "fake/arnold", runId },
        scope,
        type: "model.started",
      },
    ]);
    commit(session, [
      ...calls.map((call, index): Fact => ({
        data: {
          callId: callIds[index] ?? "",
          capability: { kind: "tool", name: call.name },
          input: call.input ?? {},
          owner: { runId },
        },
        scope: { turnId },
        type: "call.requested",
      })),
      {
        data: { finishReason: "tool-calls", outcome: "completed", runId },
        scope,
        type: "model.settled",
      },
    ]);

    for (const [index, call] of calls.entries()) {
      const callId = callIds[index] ?? "";

      commit(session, [
        { data: { callId }, scope: { turnId }, type: "call.started" },
      ]);
      commit(session, [callSettled(callId, call, turnId)]);
    }
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
